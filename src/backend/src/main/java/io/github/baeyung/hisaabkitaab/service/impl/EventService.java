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
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class EventService
{
    /** Openings are seeded and corrected from Settings, not editable/deletable as day entries. */
    private static final Set<TransactionEvent> OPENING_EVENTS = Set.of(
            TransactionEvent.OPENING_BALANCE,
            TransactionEvent.OPENING_STOCK,
            TransactionEvent.OPENING_CASH
    );

    private final Map<TransactionEvent, EventProcessor> eventProcessorMap;
    private final Map<TargetKind, KindProcessor> kindProcessorMap;
    private final StoreService storeService;
    private final TransactionService transactionService;
    private final StoreItemService storeItemService;
    private final PartyService partyService;
    private final TransactionRepository transactionRepository;

    @PersistenceContext
    private EntityManager entityManager;

    @Autowired
    public EventService(
            List<EventProcessor> eventProcessors,
            List<KindProcessor> kindProcessors,
            StoreService storeService,
            TransactionService transactionService,
            StoreItemService storeItemService,
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

        this.storeService = storeService;
        this.transactionService = transactionService;
        this.storeItemService = storeItemService;
        this.partyService = partyService;
    }

    public void publishEvent(EventRequest eventRequest, String ownerIdentifier)
    {
        EventProcessor processor = this.eventProcessorMap.get(eventRequest.getTransactionEvent());

        if (processor != null)
        {
            Store store = requireStore(ownerIdentifier);

            Transaction transaction = transactionService.create(
                    Transaction
                            .builder()
                            .store(store)
                            .event(eventRequest.getTransactionEvent())
                            .party(resolveParty(eventRequest, ownerIdentifier))
                            .bill(eventRequest.getBillNumber())
                            .eventDate(eventRequest.getBillDate())
                            .entryDate(LocalDate.now())
                            .description(cleanDescription(eventRequest))
                            .build()
            );

            fanOut(eventRequest, transaction);
        }
    }

    /**
     * Correct an existing entry in place. Because every balance (khata, cash, stock)
     * is folded from the entry's lines at read time, an edit is: drop the old lines
     * and re-derive them from the corrected values — no balance to reconcile. The
     * event type is fixed (a receipt edits as a receipt); a wrong type is a delete +
     * re-add. Opening entries belong to Settings, so they read here as "not found".
     */
    @Transactional
    public void updateEvent(String id, EventRequest eventRequest, String ownerIdentifier)
    {
        Transaction transaction = loadEditable(id, ownerIdentifier);

        // orphanRemoval drops the old derived lines; saveAndFlush makes those DELETEs
        // land before the processors insert the fresh ones, so no stale rows survive.
        transaction.getLines().clear();
        transaction.setParty(resolveParty(eventRequest, ownerIdentifier));
        transaction.setBill(eventRequest.getBillNumber());
        transaction.setEventDate(eventRequest.getBillDate());
        transaction.setDescription(cleanDescription(eventRequest));
        transactionRepository.saveAndFlush(transaction);

        fanOut(eventRequest, transaction);
    }

    /** Delete an entry; its lines cascade away and every balance re-derives without them. */
    @Transactional
    public void deleteEvent(String id, String ownerIdentifier)
    {
        transactionRepository.delete(loadEditable(id, ownerIdentifier));
    }

    /** The entry as an {@link EventRequest}, to prefill the entry screen in edit mode. */
    @Transactional(readOnly = true)
    public EventRequest getEvent(String id, String ownerIdentifier)
    {
        return toRequest(loadEditable(id, ownerIdentifier));
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
                throw new UnsupportedOperationException("kind not supported: " + kind);
            }
            kindProcessor.process(eventRequest, inout, transaction.getEvent(), transaction);
        });
    }

    private Store requireStore(String ownerIdentifier)
    {
        Store store = storeService.findFirstByOwnerIdentifier(ownerIdentifier);
        if (store == null)
        {
            throw ResourceNotFoundException.forEntity("Store for owner", ownerIdentifier);
        }
        return store;
    }

    /** Load an owned, non-opening entry (or 404) — the guard shared by get/update/delete. */
    private Transaction loadEditable(String id, String ownerIdentifier)
    {
        Store store = requireStore(ownerIdentifier);
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

    // Only the shopkeeper's own note is stored. An entry saved without one gets its
    // label rendered by the frontend from the event, party and amount, so it follows
    // the UI language instead of freezing English into the row.
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

    private Party resolveParty(EventRequest eventRequest, String ownerIdentifier)
    {
        EventRequest.Party party = eventRequest.getParty();
        if (party == null)
        {
            return null;
        }

        if (!StringUtils.hasText(party.getPartyId()))
        {
            return partyService.create(
                    Party
                            .builder()
                            .name(party.getName())
                            .contact("090078601")
                            .address("address@HisaabKitaab")
                            .build(),
                    ownerIdentifier
            );
        }

        return partyService.findEntity(party.getPartyId());
    }
}
