package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

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
import lombok.RequiredArgsConstructor;

/**
 * Processed goods: raw cloth and consumables go in, a different item comes out.
 *
 * <p>Deliberately outside the event-processor fan-out that SALE and PURCHASE go through.
 * That machinery hands each {@code TargetKind} a single {@link InOut} per event, and a
 * batch moves stock <em>both</em> ways at once — out for what it consumed, in for what it
 * made. It also touches neither cash nor a party, so two of the three kind processors would
 * have nothing to do.
 *
 * <p>The entry is still an ordinary {@link Transaction}, which is what makes it visible:
 * stock is folded from lines at read time (see {@code InventoryQueryService}), so posting
 * lines is the only way to move it, and deleting the entry reverses those movements for
 * free. Delete therefore reuses {@code DELETE /api/stores/{storeId}/event/{id}}.
 *
 * <p>The three sides are told apart by direction, which is also how they are read back:
 * <ul>
 *   <li>{@link InOut#NONE} — a raw material. No catalogue item, so it holds no stock and
 *       carries its own {@link TransactionLine#getName() name}; every stock fold skips it.
 *   <li>{@link InOut#OUT} — a consumable, taken out of stock.
 *   <li>{@link InOut#IN} — the output item, added to stock and repriced (see
 *       {@link #reprice}).
 * </ul>
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

    /** Record one batch: post its stock movements and reprice what it produced. */
    public void process(ProcessingRequest request, Store store)
    {
        ProcessingRequest.OutputLine output = request.getOutput();
        BigDecimal outputQuantity = orZero(output.getQuantity());
        BigDecimal unitCost = unitCost(request);

        Party party = request.getParty() == null
                ? null
                : partyService.resolveOrCreate(
                        request.getParty().getPartyId(), request.getParty().getName(), store);

        Transaction transaction = Transaction.builder()
                .store(store)
                .party(party)
                .event(TransactionEvent.PROCESSING)
                .bill(request.getBillNumber())
                .eventDate(request.getBillDate())
                .entryDate(LocalDate.now())
                .description(StringUtils.hasText(request.getDescription())
                        ? request.getDescription().trim()
                        : null)
                .build();

        StoreItem outputItem = storeItemService.resolveOrCreate(
                output.getItemId(), output.getName(), output.getUnit(), store);

        // Read before the transaction is saved: the weighted average needs what was on hand
        // *before* this batch, and saving would auto-flush into the very sum being read.
        BigDecimal stockBefore = orZero(
                transactionLineRepository.sumStockByItem(outputItem.getId(), store.getId()));

        // Built into the transaction's own collection rather than saved on their own, so the
        // entry in hand carries its lines. Persisting them separately leaves this object with
        // the empty collection it was built with — which is exactly the staleness EventService
        // has to call entityManager.refresh to undo.
        List<TransactionLine> lines = transaction.getLines();

        for (ProcessingRequest.RawLine raw : request.getRawItems())
        {
            lines.add(line(transaction, InOut.NONE, raw.getUnit(), raw.getQuantity(), raw.getPricePerUnit())
                    .name(raw.getName())
                    .build());
        }

        for (ProcessingRequest.ProcessingLine used : request.getProcessingItems())
        {
            StoreItem item = storeItemService.resolveOrCreate(
                    used.getItemId(), used.getName(), used.getUnit(), store);
            lines.add(line(transaction, InOut.OUT, used.getUnit(), used.getQuantity(), used.getPricePerUnit())
                    .item(item)
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

        // The party side, when there is one: worth nothing, deliberately. Job work moves no
        // money on its own — the bill for it is a separate SALE — so the batch must not touch
        // the khata's arithmetic. InOut.NONE with a zero value is what keeps it out: every
        // balance sum CASEs anything that is not IN/OUT to 0, while the statement query
        // selects PARTY lines regardless of direction. So the batch shows in the party's
        // khata, links back to itself, and leaves the baqaya exactly where it was.
        if (party != null)
        {
            lines.add(TransactionLine.builder()
                    .transaction(transaction)
                    .targetKind(TargetKind.PARTY)
                    .party(party)
                    .inOut(InOut.NONE)
                    .value(0.0)
                    .build());
        }

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
        for (ProcessingRequest.RawLine raw : request.getRawItems())
        {
            total = total.add(orZero(raw.getQuantity()).multiply(orZero(raw.getPricePerUnit())));
        }
        for (ProcessingRequest.ProcessingLine used : request.getProcessingItems())
        {
            total = total.add(orZero(used.getQuantity()).multiply(orZero(used.getPricePerUnit())));
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

        Party party = transaction.getParty();

        return new ProcessingResponse(
                transaction.getId(),
                transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate(),
                transaction.getBill(),
                transaction.getDescription(),
                party == null ? null : party.getId(),
                party == null ? null : party.getName(),
                inputRows(stock, InOut.NONE),
                inputRows(stock, InOut.OUT),
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
     * One side of the batch, by name. Lines carry no ordering column, so the row order the
     * shopkeeper typed is not recoverable — sorting gives the list a stable one instead of
     * whatever the fetch happened to return.
     */
    private List<ProcessingResponse.InputRow> inputRows(List<TransactionLine> stock, InOut side)
    {
        return stock.stream()
                .filter(line -> line.getInOut() == side)
                .map(line -> new ProcessingResponse.InputRow(
                        lineName(line),
                        line.getUnit(),
                        line.getQuantity(),
                        line.getItemSoldAt() == null ? null : BigDecimal.valueOf(line.getItemSoldAt())))
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
