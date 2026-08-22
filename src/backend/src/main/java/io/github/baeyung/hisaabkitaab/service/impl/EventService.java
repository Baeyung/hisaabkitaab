package io.github.baeyung.hisaabkitaab.service.impl;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.processors.targetkind.KindProcessor;
import io.github.baeyung.hisaabkitaab.processors.transactionevent.EventProcessor;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class EventService
{
    private static final Logger log = LoggerFactory.getLogger(EventService.class);

    /** Openings are seeded and corrected from Settings, not editable/deletable as day entries. */
    private static final Set<TransactionEvent> OPENING_EVENTS = Set.of(
            TransactionEvent.OPENING_BALANCE,
            TransactionEvent.OPENING_STOCK,
            TransactionEvent.OPENING_CASH
    );

    private final Map<TransactionEvent, EventProcessor> eventProcessorMap;
    private final Map<TargetKind, KindProcessor> kindProcessorMap;
    private final TransactionService transactionService;
    private final PartyService partyService;
    private final TransactionRepository transactionRepository;

    @PersistenceContext
    private EntityManager entityManager;

    @Autowired
    public EventService(
            List<EventProcessor> eventProcessors,
            List<KindProcessor> kindProcessors,
            TransactionService transactionService,
            PartyService partyService,
            TransactionRepository transactionRepository
    )
    {
        this.transactionRepository = transactionRepository;
        this.eventProcessorMap = eventProcessors
                .stream()
                .collect(
                        Collectors.toMap(
                                EventProcessor::getTransactionEvent,
                                Function.identity(),
                                (a, b) -> {
                                throw new IllegalStateException(
                                        "Multiple EventProcessors registered for " + a.getTransactionEvent()
                                );
                            }
                        )
                );

        this.kindProcessorMap = kindProcessors
                .stream()
                .collect(
                        Collectors.toMap(
                                KindProcessor::getTargetKind,
                                Function.identity(),
                                (a, b) -> {
                                    throw new IllegalStateException(
                                            "Multiple KindProcessors registered for " + a.getTargetKind()
                                    );
                                }
                        )
                );

        this.transactionService = transactionService;
        this.partyService = partyService;
    }

    public void publishEvent(EventRequest eventRequest, Store store)
    {
        EventProcessor processor = this.eventProcessorMap.get(eventRequest.getTransactionEvent());

        if (processor == null)
        {
            // Silently doing nothing is the worst answer a write can give: the caller is told
            // 200 and no entry appears. Until that becomes a refusal, it is at least on record.
            log.error("no processor registered for event {} — entry dropped for store {}",
                    eventRequest.getTransactionEvent(), store.getId());
            return;
        }

        Transaction transaction = transactionService.create(
                Transaction
                        .builder()
                        .store(store)
                        .event(eventRequest.getTransactionEvent())
                        .party(resolveParty(eventRequest, store))
                        .bill(eventRequest.getBillNumber())
                        .eventDate(eventRequest.getBillDate())
                        .entryDate(LocalDate.now())
                        .description(cleanDescription(eventRequest))
                        .build()
        );

        log.info("posted {} entry {} in store {} [bill={} date={} party={} cash={} items={}]",
                transaction.getEvent(), transaction.getId(), store.getId(),
                eventRequest.getBillNumber(), eventRequest.getBillDate(),
                transaction.getParty() == null ? null : transaction.getParty().getName(),
                eventRequest.getCashAmount(),
                eventRequest.getItems() == null ? 0 : eventRequest.getItems().size());

        fanOut(eventRequest, transaction);
    }

    /**
     * Correct an existing entry in place. Because every balance (khata, cash, stock)
     * is folded from the entry's lines at read time, an edit is: drop the old lines
     * and re-derive them from the corrected values — no balance to reconcile. The
     * event type is fixed (a receipt edits as a receipt); a wrong type is a delete +
     * re-add. Opening entries belong to Settings, so they read here as "not found".
     */
    @Transactional
    public void updateEvent(String id, EventRequest eventRequest, Store store)
    {
        Transaction transaction = loadEditable(id, store);

        // A processed-goods batch is not an EventRequest and never round-trips through the
        // processors — re-deriving it from one would drop its raw rows and leave the output
        // item priced off a batch that no longer exists. Correcting one is delete + re-enter.
        if (transaction.getEvent() == TransactionEvent.PROCESSING)
        {
            log.warn("refusing to edit entry {}: a PROCESSING batch has to be deleted and re-entered", id);
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A processed-goods entry cannot be edited — delete it and enter it again");
        }

        // orphanRemoval drops the old derived lines; saveAndFlush makes those DELETEs
        // land before the processors insert the fresh ones, so no stale rows survive.
        log.info("editing {} entry {} in store {}: {} old line(s) dropped and re-derived",
                transaction.getEvent(), id, store.getId(), transaction.getLines().size());

        transaction.getLines().clear();
        transaction.setParty(resolveParty(eventRequest, store));
        transaction.setBill(eventRequest.getBillNumber());
        transaction.setEventDate(eventRequest.getBillDate());
        transaction.setDescription(cleanDescription(eventRequest));
        transactionRepository.saveAndFlush(transaction);

        fanOut(eventRequest, transaction);
    }

    /**
     * Delete an entry; its lines cascade away and every balance re-derives without them.
     *
     * @param recentOnly the caller is not the shop's owner, so they may only take back what
     *                   they booked within {@link Transaction#DELETE_WINDOW} — erasing older
     *                   history is the owner's call. Editing it is not restricted; only the
     *                   irreversible part is.
     */
    @Transactional
    public void deleteEvent(String id, Store store, boolean recentOnly)
    {
        Transaction transaction = loadEditable(id, store);
        if (recentOnly && !transaction.isRecent())
        {
            log.warn("refusing to delete entry {} ({}, entered {}): outside the window and the caller is not the owner",
                    id, transaction.getEvent(), transaction.getEntryDate());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the shop owner can delete entries older than 24 hours");
        }

        log.info("deleting {} entry {} from store {} [bill={} date={} lines={}]",
                transaction.getEvent(), id, store.getId(), transaction.getBill(),
                transaction.getEventDate(), transaction.getLines().size());

        transactionRepository.delete(transaction);
    }

    /** The entry as an {@link EventRequest}, to prefill the entry screen in edit mode. */
    @Transactional(readOnly = true)
    public EventRequest getEvent(String id, Store store)
    {
        return toRequest(loadEditable(id, store));
    }

    // ── shared machinery ──────────────────────────────────────────────────────

    /** Fan an entry out to the cash/party/stock processors, which post its lines. */
    private void fanOut(EventRequest eventRequest, Transaction transaction)
    {
        EventProcessor processor = this.eventProcessorMap.get(transaction.getEvent());
        processor.getTargetKinds().forEach((kind, inout) -> {
            KindProcessor kindProcessor = this.kindProcessorMap.get(kind);
            if (kindProcessor == null)
            {
                log.error("entry {} names target kind {}, which nothing handles", transaction.getId(), kind);
                throw new UnsupportedOperationException("kind not supported: " + kind);
            }
            kindProcessor.process(eventRequest, inout, transaction.getEvent(), transaction);
        });
    }

    /** Load an in-store, non-opening entry (or 404) — the guard shared by get/update/delete. */
    private Transaction loadEditable(String id, Store store)
    {
        Transaction transaction = transactionRepository.findByIdAndStoreId(id, store.getId())
                .filter(t -> !OPENING_EVENTS.contains(t.getEvent()))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Entry", id));

        // The processors persist lines directly, never into the transaction's `lines`
        // collection, so a transaction still cached in this session from its own creation
        // carries a stale (empty) collection. Refresh so both the reverse-map read and
        // update's orphan-removal see the real lines. A no-op on a fresh request load.
        entityManager.refresh(transaction);
        return transaction;
    }

    // Only the shopkeeper's own note is stored — never the row's label, which the
    // frontend renders from the event, party and amount so it follows the UI language
    // instead of freezing English into the row. The note trails that label in brackets.
    private String cleanDescription(EventRequest eventRequest)
    {
        return StringUtils.hasText(eventRequest.getDescription())
                ? eventRequest.getDescription().trim()
                : null;
    }

    /** Rebuild the entry form's request from an entry's stored lines (the inverse of the processors). */
    private EventRequest toRequest(Transaction transaction)
    {
        EventRequest request = new EventRequest();
        request.setTransactionEvent(transaction.getEvent());
        request.setBillNumber(transaction.getBill());
        request.setBillDate(transaction.getEventDate());
        request.setDescription(transaction.getDescription());
        if (transaction.getParty() != null)
        {
            request.setParty(new EventRequest.Party(
                    transaction.getParty().getId(), transaction.getParty().getName()));
        }

        List<TransactionLine> lines = transaction.getLines();

        lines.stream()
                .filter(line -> line.getTargetKind() == TargetKind.CASH)
                .findFirst()
                .ifPresent(cash -> {
                    request.setCashAmount(cash.getValue());
                    if (transaction.getEvent() == TransactionEvent.EXPENSE
                            && cash.getExpenseCategory() != null)
                    {
                        request.setExpenseCategory(cash.getExpenseCategory().getName());
                    }
                });

        List<EventRequest.Item> items = lines.stream()
                .filter(line -> line.getTargetKind() == TargetKind.STOCK && line.getItem() != null)
                .map(line -> new EventRequest.Item(
                        line.getItem().getId(),
                        line.getItem().getName(),
                        line.getQuantity(),
                        line.getItemSoldAt()))
                .toList();
        request.setItems(items);

        // The goods total isn't stored; it's Σ(qty × rate) over the stock lines — the
        // same sum the entry form sent as billAmount.
        if (transaction.getEvent() == TransactionEvent.SALE
                || transaction.getEvent() == TransactionEvent.PURCHASE)
        {
            request.setBillAmount(items.stream()
                    .filter(item -> item.getQuantity() != null && item.getItemSoldAt() != null)
                    .mapToDouble(item -> item.getQuantity().doubleValue() * item.getItemSoldAt())
                    .sum());
        }

        return request;
    }

    /** The entry's counterparty; see {@link PartyService#resolveOrCreate}. */
    private Party resolveParty(EventRequest eventRequest, Store store)
    {
        EventRequest.Party party = eventRequest.getParty();
        return party == null
                ? null
                : partyService.resolveOrCreate(party.getPartyId(), party.getName(), store);
    }
}
