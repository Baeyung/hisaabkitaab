package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.dto.processing.ProcessingRequest;
import io.github.baeyung.hisaabkitaab.dto.processing.ProcessingResponse;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.impl.EventService;
import lombok.RequiredArgsConstructor;

/**
 * Processed goods: raw cloth and consumables go in, a different item comes out.
 *
 * <p>Deliberately outside the event-processor fan-out that SALE and PURCHASE go through.
 * That machinery hands each {@code TargetKind} a single {@link InOut} per event, and a
 * batch moves stock <em>both</em> ways at once — out for what it consumed, in for what it
 * made.
 *
 * <p>The entry is still an ordinary {@link Transaction}, which is what makes it visible:
 * stock is folded from lines at read time (see {@code InventoryQueryService}), so posting
 * lines is the only way to move it, and deleting the entry reverses those movements for
 * free. Delete therefore reuses {@code DELETE /api/stores/{storeId}/event/{id}}.
 *
 * <p>An input row bought in for the batch rather than taken off the shelf carries a party.
 * That is not folded into the batch: it posts a plain {@link TransactionEvent#PURCHASE}
 * entry of its own through the ordinary processors, so it lands in the supplier's khata,
 * takes what was paid out of the drawer and puts the goods on the shelf — which this batch
 * then consumes, leaving stock exactly where it started. Two entries, each doing one thing,
 * and neither needing a special case in any read model.
 *
 * <p>A consumable row can instead be a <em>service</em> — dyeing charges, labour. That is
 * recorded on the catalogue item ({@link StoreItem#isService()}), which every inventory screen
 * already reads as "keeps no stock", so the row costs the batch and bills its supplier exactly
 * like any other and nothing here has to know about it.
 *
 * <p>The batch's own lines are all {@link TargetKind#STOCK}, told apart by direction:
 * {@link InOut#OUT} for what it consumed, {@link InOut#IN} for what it made and repriced
 * (see {@link #reprice}). A raw row additionally keeps its own
 * {@link TransactionLine#getName() name}, which is what tells the two input sides apart on
 * the way back — consumables are named by their item alone.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ProcessingService
{
    /**
     * Working precision for a unit cost. Deliberately finer than money is shown at: a cost
     * per gram divided out of a whole batch is small, and rounding it to paisa here would
     * compound through every weighted average that follows.
     */
    private static final int COST_SCALE = 4;

    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;
    private final StoreItemRepository storeItemRepository;
    private final StoreItemService storeItemService;
    private final PartyService partyService;
    private final EventService eventService;

    /** Record one batch: buy in what it needs, post its stock movements, reprice what it made. */
    public void process(ProcessingRequest request, Store store)
    {
        ProcessingRequest.OutputLine output = request.getOutput();
        BigDecimal outputQuantity = orZero(output.getQuantity());
        BigDecimal unitCost = unitCost(request);

        // Every row's item resolved against one another, not just against the catalogue: see
        // {@link #item}. Ordered so the map reads in entry order when debugging.
        Map<String, StoreItem> catalogue = new LinkedHashMap<>();

        List<Input> inputs = new ArrayList<>();
        request.getRawItems().forEach(line -> inputs.add(resolve(line, true, store, catalogue)));
        request.getProcessingItems().forEach(line -> inputs.add(resolve(line, false, store, catalogue)));

        StoreItem outputItem = item(
                output.getItemId(), output.getName(), output.getUnit(), store, catalogue);

        // What the shelf held before this entry — read before anything it posts, both the
        // purchases below and the lines further down, either of which would otherwise flush
        // into the very sum being read. The purchases matter here because a batch may buy in
        // the same item it makes (dye KORA, get KORA back): counting the cloth it is about to
        // consume as stock to average against would weigh the new cost down by goods that no
        // longer exist once the entry is through — and against a purchase's zero cost price at
        // that, halving the figure.
        BigDecimal stockBefore = orZero(
                transactionLineRepository.sumStockByItem(outputItem.getId(), store.getId()));

        // The shelf has to hold the goods before it can give them up. Nothing downstream
        // depends on the order, but the books read in it.
        purchaseInputs(inputs, request, store);

        Transaction transaction = Transaction.builder()
                .store(store)
                .event(TransactionEvent.PROCESSING)
                .bill(request.getBillNumber())
                .eventDate(request.getBillDate())
                .entryDate(LocalDate.now())
                .description(StringUtils.hasText(request.getDescription())
                        ? request.getDescription().trim()
                        : null)
                .build();

        // Built into the transaction's own collection rather than saved on their own, so the
        // entry in hand carries its lines. Persisting them separately leaves this object with
        // the empty collection it was built with — which is exactly the staleness EventService
        // has to call entityManager.refresh to undo.
        List<TransactionLine> lines = transaction.getLines();

        for (Input input : inputs)
        {
            lines.add(line(transaction, InOut.OUT, input.line().getUnit(),
                    input.line().getQuantity(), input.line().getPricePerUnit())
                    .item(input.item())
                    // Only the raw side is named: it is the one flag that tells the two input
                    // sides apart when the batch is read back, and a consumable is already
                    // named by its item.
                    .name(input.raw() ? input.line().getName() : null)
                    // Kept for the batch's own page, so it can show which rows were bought in
                    // and from whom. Balances never look at a STOCK line's party — that is
                    // the PURCHASE entry's job.
                    .party(input.party())
                    .build());
        }

        // `value` carries the wastage. On a STOCK line it is otherwise dead weight — the
        // other events copy the transaction's cash amount into it and every reader ignores
        // it (see InventoryQueryService's note) — so the batch's one leftover number rides
        // there rather than earning a column of its own on a table shared by five events.
        lines.add(line(transaction, InOut.IN, output.getUnit(), outputQuantity, unitCost)
                .item(outputItem)
                .value(orZero(output.getWastage()).doubleValue())
                .build());

        transactionRepository.save(transaction);

        reprice(outputItem, stockBefore, outputQuantity, unitCost);
    }

    /** Every batch this store has run, newest first. */
    @Transactional(readOnly = true)
    public List<ProcessingResponse> list(String storeId)
    {
        return transactionRepository
                .findByStoreAndEventNewestFirst(storeId, TransactionEvent.PROCESSING)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * One batch, for its own page. Store-scoped by the same query the bill detail uses, and
     * 404-ing on any other event so an ordinary transaction id cannot be read as a batch.
     */
    @Transactional(readOnly = true)
    public ProcessingResponse get(String transactionId, String storeId)
    {
        return transactionRepository.findByIdAndStoreId(transactionId, storeId)
                .filter(transaction -> transaction.getEvent() == TransactionEvent.PROCESSING)
                .map(this::toResponse)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Processing", transactionId));
    }

    // ── buying in what the batch consumes ─────────────────────────────────────

    /**
     * One PURCHASE entry per supplier, over the rows bought from them: exactly what the
     * purchase screen posts, so the khata, the cashbook and the shelf all move the way they
     * do for any other purchase — no special case anywhere. A supplier named on three rows
     * gets one entry, not three, because that is how the shopkeeper settles with them.
     *
     * <p>What is not paid now stays on their khata, which is the purchase processor's own
     * arithmetic (bill − cash), untouched here.
     */
    private void purchaseInputs(List<Input> inputs, ProcessingRequest request, Store store)
    {
        Map<String, List<Input>> byParty = inputs.stream()
                .filter(input -> input.party() != null)
                .collect(Collectors.groupingBy(
                        input -> input.party().getId(), LinkedHashMap::new, Collectors.toList()));

        byParty.forEach((partyId, rows) -> {
            EventRequest purchase = new EventRequest();
            purchase.setTransactionEvent(TransactionEvent.PURCHASE);
            purchase.setParty(new EventRequest.Party(partyId, rows.getFirst().party().getName()));
            purchase.setBillNumber(request.getBillNumber());
            purchase.setBillDate(request.getBillDate());
            purchase.setBillAmount(rows.stream().mapToDouble(Input::amount).sum());
            purchase.setCashAmount(rows.stream().mapToDouble(Input::paid).sum());
            purchase.setItems(rows.stream()
                    .map(row -> new EventRequest.Item(
                            row.item().getId(),
                            row.item().getName(),
                            orZero(row.line().getQuantity()),
                            orZero(row.line().getPricePerUnit()).doubleValue()))
                    .toList());

            eventService.publishEvent(purchase, store);
        });
    }

    /** An input row with its catalogue item and supplier resolved — the form the write side needs. */
    private Input resolve(
            ProcessingRequest.InputLine line,
            boolean raw,
            Store store,
            Map<String, StoreItem> catalogue
    )
    {
        StoreItem item = item(line.getItemId(), line.getName(), line.getUnit(), store, catalogue);

        // The box on the row marks the item, not the line: a service is what the thing is, and
        // the inventory screens already show no on-hand quantity for one, so the batch needs no
        // special case — its cost still counts and its supplier is still billed. Only ever set,
        // never cleared: un-ticking here must not quietly un-service an item other entries use.
        if (line.isService() && !item.isService())
        {
            item.setService(true);
            storeItemRepository.save(item);
        }

        Party party = line.getParty() == null
                ? null
                : partyService.resolveOrCreate(line.getParty().getPartyId(), line.getParty().getName(), store);

        return new Input(line, item, party, raw);
    }

    /**
     * The catalogue item a row names, resolved once for the whole batch.
     *
     * <p>{@link StoreItemService#resolveOrCreate} creates a fresh item for every name that
     * arrives without an id, which is right across entries — the screen sends the id once the
     * catalogue holds the name — but wrong within one. A batch names the same thing twice all
     * the time: two rows of the same dye, and above all a batch that <em>makes what it
     * consumes</em> (buy KORA, dye it, get KORA back). Resolved row by row, that first entry
     * would leave two catalogue rows called KORA with the stock split between them.
     *
     * <p>Keyed by id when the screen sent one and by name otherwise, and a resolved item is
     * registered under both, so a row that named the item by id and one that typed the same
     * name still land on it.
     */
    private StoreItem item(String itemId, String name, String unit, Store store, Map<String, StoreItem> catalogue)
    {
        String nameKey = "name:" + (name == null ? "" : name.trim().toLowerCase(Locale.ROOT));
        String key = StringUtils.hasText(itemId) ? itemId : nameKey;

        StoreItem item = catalogue.get(key);
        if (item == null)
        {
            item = storeItemService.resolveOrCreate(itemId, name, unit, store);
            catalogue.put(key, item);
            catalogue.putIfAbsent("name:" + item.getName().trim().toLowerCase(Locale.ROOT), item);
        }
        return item;
    }

    private record Input(ProcessingRequest.InputLine line, StoreItem item, Party party, boolean raw)
    {
        double amount()
        {
            return orZero(line.getQuantity()).multiply(orZero(line.getPricePerUnit())).doubleValue();
        }

        double paid()
        {
            return orZero(line.getPaid()).doubleValue();
        }
    }

    // ── the price of a batch ──────────────────────────────────────────────────

    /**
     * What one unit of output cost to make: every input's quantity × price, over the output
     * quantity. The screen shows this figure and lets the shopkeeper type over it — anything
     * sent wins, and it is only computed here when nothing was.
     */
    private BigDecimal unitCost(ProcessingRequest request)
    {
        BigDecimal given = request.getOutput().getUnitCost();
        if (given != null)
        {
            return given;
        }

        BigDecimal quantity = orZero(request.getOutput().getQuantity());
        if (quantity.signum() == 0)
        {
            return BigDecimal.ZERO;
        }

        BigDecimal total = BigDecimal.ZERO;
        for (ProcessingRequest.InputLine line : request.getRawItems())
        {
            total = total.add(orZero(line.getQuantity()).multiply(orZero(line.getPricePerUnit())));
        }
        for (ProcessingRequest.InputLine line : request.getProcessingItems())
        {
            total = total.add(orZero(line.getQuantity()).multiply(orZero(line.getPricePerUnit())));
        }

        return total.divide(quantity, COST_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Fold the batch into the output item's price list.
     *
     * <p>Cost is a weighted average over what was already on the shelf, so a cheap batch on
     * top of an expensive one lands between the two rather than erasing the older figure.
     * With nothing on hand — a brand-new item, or one sold down to exactly nothing — there is
     * nothing to weight against and the batch simply sets the price. A <em>negative</em>
     * balance still averages: it means the books say goods left that never arrived, and
     * silently ignoring that would hide it. Only the case where the two sides cancel out
     * exactly is refused, because that divides by zero.
     *
     * <p>Sale price then moves with cost at the margin the item already carried, so a shop
     * that sells this at cost + 20% keeps selling it at cost + 20% without retyping the
     * price. An item with no margin to read — no sale price, or no cost price to measure one
     * against — is left alone rather than given an invented one.
     */
    private void reprice(StoreItem item, BigDecimal stockBefore, BigDecimal quantity, BigDecimal unitCost)
    {
        BigDecimal oldCost = item.getCostPrice();
        BigDecimal oldSale = item.getSalePrice();
        BigDecimal combined = stockBefore.add(quantity);

        BigDecimal newCost = oldCost == null || stockBefore.signum() == 0 || combined.signum() == 0
                ? unitCost
                : stockBefore.multiply(oldCost)
                        .add(quantity.multiply(unitCost))
                        .divide(combined, COST_SCALE, RoundingMode.HALF_UP);

        item.setCostPrice(newCost);

        if (oldSale != null && oldCost != null && oldCost.signum() > 0)
        {
            item.setSalePrice(newCost.multiply(oldSale).divide(oldCost, COST_SCALE, RoundingMode.HALF_UP));
        }

        storeItemRepository.save(item);
    }

    // ── reading a batch back ──────────────────────────────────────────────────

    private ProcessingResponse toResponse(Transaction transaction)
    {
        List<TransactionLine> stock = transaction.getLines().stream()
                .filter(line -> line.getTargetKind() == TargetKind.STOCK)
                .toList();

        TransactionLine output = stock.stream()
                .filter(line -> line.getInOut() == InOut.IN)
                .findFirst()
                .orElse(null);

        // Batches booked before the party moved onto the rows carry it on the transaction.
        Party party = transaction.getParty();

        return new ProcessingResponse(
                transaction.getId(),
                transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate(),
                transaction.getBill(),
                transaction.getDescription(),
                party == null ? null : party.getId(),
                party == null ? null : party.getName(),
                inputRows(stock, line -> line.getName() != null),
                inputRows(stock, line -> line.getName() == null && line.getInOut() == InOut.OUT),
                output == null ? null : new ProcessingResponse.OutputRow(
                        output.getItem() != null ? output.getItem().getId() : null,
                        lineName(output),
                        output.getUnit(),
                        output.getQuantity(),
                        output.getItemSoldAt() == null ? null : BigDecimal.valueOf(output.getItemSoldAt()),
                        output.getValue() == null ? null : BigDecimal.valueOf(output.getValue())
                ),
                transaction.isRecent()
        );
    }

    /**
     * One side of the batch. A raw row is the one carrying its own name — the consumables are
     * named by their item — which also picks up batches booked before raw rows became
     * catalogue items, where the row sits at {@link InOut#NONE} with no item at all.
     *
     * <p>Lines carry no ordering column, so the row order the shopkeeper typed is not
     * recoverable — sorting gives the list a stable one instead of whatever the fetch
     * happened to return.
     */
    private List<ProcessingResponse.InputRow> inputRows(List<TransactionLine> stock, Predicate<TransactionLine> side)
    {
        return stock.stream()
                .filter(side)
                .map(line -> new ProcessingResponse.InputRow(
                        lineName(line),
                        line.getUnit(),
                        line.getQuantity(),
                        line.getItemSoldAt() == null ? null : BigDecimal.valueOf(line.getItemSoldAt()),
                        line.getParty() == null ? null : line.getParty().getId(),
                        line.getParty() == null ? null : line.getParty().getName()))
                .sorted(Comparator.comparing(
                        ProcessingResponse.InputRow::name,
                        Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)))
                .toList();
    }

    /** A line's label: the catalogue item's name, or the raw row's own. */
    private String lineName(TransactionLine line)
    {
        return line.getItem() != null ? line.getItem().getName() : line.getName();
    }

    private TransactionLine.TransactionLineBuilder line(
            Transaction transaction,
            InOut inOut,
            String unit,
            BigDecimal quantity,
            BigDecimal pricePerUnit
    )
    {
        return TransactionLine.builder()
                .transaction(transaction)
                .targetKind(TargetKind.STOCK)
                .inOut(inOut)
                .unit(unit)
                .quantity(quantity)
                .itemSoldAt(pricePerUnit == null ? null : pricePerUnit.doubleValue());
    }

    private static BigDecimal orZero(BigDecimal value)
    {
        return value == null ? BigDecimal.ZERO : value;
    }
}
