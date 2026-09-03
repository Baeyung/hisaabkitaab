package io.github.baeyung.hisaabkitaab.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.service.query.support.PartyLedgerRow;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

@Repository
public interface TransactionLineRepository extends JpaRepository<TransactionLine, String>
{
    List<TransactionLine> findByTransactionId(String transactionId);

    List<TransactionLine> findByPartyId(String partyId);

    List<TransactionLine> findByItemId(String itemId);

    // ── Read-model queries ────────────────────────────────────────────────────
    // The event/kind processors only ever persist IN or OUT lines, but the CASE
    // expressions below still default anything else to 0 so a future NONE/UNKNOWN
    // row can never silently corrupt a balance.
    //
    // A transaction's eventDate comes from the client's bill date and can be null;
    // entryDate is always set, so day queries key on coalesce(eventDate, entryDate).

    /** Net cash position (Σ IN − Σ OUT over CASH lines) before {@code day} — the cashbook opening balance. */
    @Query("""
            select coalesce(sum(case when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.IN then tl.value
                                     when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.OUT then -tl.value
                                     else 0 end), 0)
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and tl.transaction.store.id = :storeId
              and coalesce(tl.transaction.eventDate, tl.transaction.entryDate) < :day
            """)
    double sumCashBefore(@Param("storeId") String storeId, @Param("day") LocalDate day);

    /**
     * Every CASH line from {@code from} to {@code to} inclusive, chronological, with transaction,
     * party and expense category fetched for row display.
     *
     * <p>The category comes along because the dashboard reads its window's expenses out of this
     * same list — an expense is a CASH line whose entry is an EXPENSE — rather than loading every
     * expense the shop ever filed and throwing all but the window away.
     */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            left join fetch t.party
            left join fetch tl.expenseCategory
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and t.store.id = :storeId
              and coalesce(t.eventDate, t.entryDate) between :from and :to
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findCashLinesInRange(@Param("storeId") String storeId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * Net khata movement (Σ IN − Σ OUT over PARTY lines) per transaction in the range —
     * the cashbook's "on khata" column. Grouped in one query rather than walked from each
     * row's transaction, which would be a lazy load per row.
     *
     * <p>Positive means the entry moved money the store's way (a credit sale); negative the
     * other (a receipt clearing baqaya, or a purchase left owing). Transactions with no
     * PARTY line simply don't come back, and the caller reads those as nothing on khata.
     */
    @Query("""
            select tl.transaction.id as transactionId,
                   sum(case when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.IN then tl.value
                            when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.OUT then -tl.value
                            else 0 end) as net
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and tl.transaction.store.id = :storeId
              and coalesce(tl.transaction.eventDate, tl.transaction.entryDate) between :from and :to
            group by tl.transaction.id
            """)
    List<TransactionPartyNetRow> sumPartyNetByTransactionInRange(
            @Param("storeId") String storeId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * Every spend head with its entry count and total — the khata screen's category table, which
     * prints those three figures and nothing else.
     *
     * <p>Rolled up in the database rather than folded from the lines: a shop a few years in has
     * tens of thousands of expenses, and loading them all to count them made this the slowest
     * call in the app. The rows behind a head are fetched one head at a time, when the shopkeeper
     * opens it — see {@link #findExpenseLinesByCategory}.
     *
     * <p>Lines filed before categories existed carry none, and coalesce puts them under
     * UNCATEGORIZED — the same key {@link #findExpenseLinesByCategory} takes back. That literal
     * has to stay equal to {@code ExpenseCategoryService.UNCATEGORIZED}; JPQL cannot name the
     * constant, so LedgerHeadsApiTest asserts the two agree.
     */
    @Query("""
            select coalesce(ec.name, 'UNCATEGORIZED') as category,
                   count(tl) as count,
                   coalesce(sum(tl.value), 0) as total
            from TransactionLine tl
            join tl.transaction t
            left join tl.expenseCategory ec
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and t.event = io.github.baeyung.hisaabkitaab.enums.TransactionEvent.EXPENSE
              and t.store.id = :storeId
            group by coalesce(ec.name, 'UNCATEGORIZED')
            """)
    List<ExpenseCategoryTotalRow> sumExpensesByCategory(@Param("storeId") String storeId);

    /** One spend head's EXPENSE lines, chronological — the rows behind a category the shopkeeper opened. */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            left join fetch tl.expenseCategory ec
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and t.event = io.github.baeyung.hisaabkitaab.enums.TransactionEvent.EXPENSE
              and t.store.id = :storeId
              and coalesce(ec.name, 'UNCATEGORIZED') = :category
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findExpenseLinesByCategory(@Param("storeId") String storeId, @Param("category") String category);

    /**
     * Walk-in cash trade — entries with no party, which never touch a khata and so never appear
     * among the party balances — counted and totalled per kind for the khata screen's cash table.
     *
     * <p>Rolled up in the database for the same reason as {@link #sumExpensesByCategory}: the
     * screen prints a count and a total per kind, and loading every walk-in sale the shop ever
     * rang up to arrive at two numbers is the whole cost of the page. The entries themselves are
     * fetched one kind at a time — see {@link #findCashLinesByEvent}.
     */
    @Query("""
            select t.event as event,
                   count(tl) as count,
                   coalesce(sum(tl.value), 0) as total
            from TransactionLine tl
            join tl.transaction t
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and t.event in (io.github.baeyung.hisaabkitaab.enums.TransactionEvent.SALE,
                              io.github.baeyung.hisaabkitaab.enums.TransactionEvent.PURCHASE)
              and t.party is null
              and t.store.id = :storeId
            group by t.event
            """)
    List<CashKindTotalRow> sumCashByEvent(@Param("storeId") String storeId);

    /** One kind of walk-in cash trade, chronological — the entries behind a cash head the shopkeeper opened. */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and t.event = :event
              and t.party is null
              and t.store.id = :storeId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findCashLinesByEvent(@Param("storeId") String storeId, @Param("event") TransactionEvent event);

    /** One net balance per party over its full PARTY-line history (positive = they owe the store). */
    @Query("""
            select tl.party.id as partyId,
                   sum(case when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.IN then tl.value
                            when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.OUT then -tl.value
                            else 0 end) as balance
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and tl.transaction.store.id = :storeId
            group by tl.party.id
            """)
    List<PartyBalanceRow> sumPartyBalancesByStore(@Param("storeId") String storeId);

    /**
     * Every PARTY line for one party, chronological by business date — the khata statement rows.
     * Scoped by store as well as party: the caller already owns the party, but a line is only
     * this shop's if its <em>transaction</em> is too, so a row posted from another store can
     * never appear in these books.
     */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and tl.party.id = :partyId
              and t.store.id = :storeId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findPartyLedgerLines(@Param("partyId") String partyId, @Param("storeId") String storeId);

    /**
     * Every PARTY line for the store, chronological — the raw material for receivable aging:
     * FIFO payments against charges to find how long each party's oldest still-unpaid amount
     * has sat.
     *
     * <p>A projection rather than the entities. The walk reads five fields per line and the
     * whole store's history goes into it, so hydrating a TransactionLine (and its Transaction,
     * and its Party) per row was most of what the dashboard spent its time doing.
     */
    @Query("""
            select new io.github.baeyung.hisaabkitaab.service.query.support.PartyLedgerRow(
                       tl.party.id, p.name, tl.inOut, tl.value, coalesce(t.eventDate, t.entryDate))
            from TransactionLine tl
            join tl.transaction t
            join tl.party p
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and t.store.id = :storeId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<PartyLedgerRow> findPartyLedgerRowsByStore(@Param("storeId") String storeId);

    /** One net stock quantity per item over its full STOCK-line history. */
    @Query("""
            select tl.item.id as itemId,
                   sum(case when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.IN then tl.quantity
                            when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.OUT then -tl.quantity
                            else 0 end) as stock
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.item is not null
              and tl.transaction.store.id = :storeId
            group by tl.item.id
            """)
    List<ItemStockRow> sumStockByStore(@Param("storeId") String storeId);

    /**
     * One item's net stock — the single-item form of {@link #sumStockByStore}, for the
     * weighted-average cost a PROCESSING entry folds its output into. Store-scoped for the
     * same reason as the movement history: owning the item doesn't make every line that
     * references it this shop's.
     */
    @Query("""
            select coalesce(sum(
                       case when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.IN then tl.quantity
                            when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.OUT then -tl.quantity
                            else 0 end), 0)
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.item.id = :itemId
              and tl.transaction.store.id = :storeId
            """)
    BigDecimal sumStockByItem(@Param("itemId") String itemId, @Param("storeId") String storeId);

    /**
     * Every STOCK line for one item, chronological by business date — the movement history rows.
     * Store-scoped for the same reason as {@link #findPartyLedgerLines}: ownership of the item
     * doesn't make every line that references it this shop's.
     */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.item.id = :itemId
              and t.store.id = :storeId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findItemMovementLines(@Param("itemId") String itemId, @Param("storeId") String storeId);

    /**
     * Every goods-out line of a SALE in {@code from..to}, with transaction and item fetched —
     * the dashboard's raw material for daily sales (line qty×itemSoldAt),
     * top-selling designs, and which items had any turnover in the window.
     */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            join fetch tl.item
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.OUT
              and t.event = io.github.baeyung.hisaabkitaab.enums.TransactionEvent.SALE
              and t.store.id = :storeId
              and coalesce(t.eventDate, t.entryDate) between :from and :to
            """)
    List<TransactionLine> findSaleStockLinesInRange(@Param("storeId") String storeId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** The opening-balance PARTY line per party (at most one each) — for prefill + the settings column. */
    @Query("""
            select tl.party.id as partyId, tl.inOut as inOut, tl.value as value
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and tl.transaction.event = io.github.baeyung.hisaabkitaab.enums.TransactionEvent.OPENING_BALANCE
              and tl.transaction.store.id = :storeId
            """)
    List<PartyOpeningRow> findOpeningBalancesByStore(@Param("storeId") String storeId);

    /** The opening-stock STOCK line per item (at most one each) — for prefill + the settings column. */
    @Query("""
            select tl.item.id as itemId, tl.quantity as quantity
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.transaction.event = io.github.baeyung.hisaabkitaab.enums.TransactionEvent.OPENING_STOCK
              and tl.transaction.store.id = :storeId
            """)
    List<ItemOpeningRow> findOpeningStockByStore(@Param("storeId") String storeId);

    /**
     * A party's earliest real ledger date — its own opening balance excluded — for dating
     * or correcting that opening balance (see OpeningEntryService). Null when the party has
     * no real activity yet.
     */
    @Query("""
            select min(coalesce(tl.transaction.eventDate, tl.transaction.entryDate))
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and tl.party.id = :partyId
              and tl.transaction.store.id = :storeId
              and tl.transaction.event <> io.github.baeyung.hisaabkitaab.enums.TransactionEvent.OPENING_BALANCE
            """)
    LocalDate findEarliestPartyDate(@Param("partyId") String partyId, @Param("storeId") String storeId);

    /** Batch form of {@link #findEarliestPartyDate} — one query for every party in the store, for the nightly reposition job. */
    @Query("""
            select tl.party.id as partyId,
                   min(coalesce(tl.transaction.eventDate, tl.transaction.entryDate)) as earliestDate
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and tl.transaction.store.id = :storeId
              and tl.transaction.event <> io.github.baeyung.hisaabkitaab.enums.TransactionEvent.OPENING_BALANCE
            group by tl.party.id
            """)
    List<PartyEarliestRow> findEarliestPartyDatesByStore(@Param("storeId") String storeId);

    /**
     * An item's earliest real movement date — its own opening stock excluded — for dating
     * or correcting that opening stock (see OpeningEntryService). Null when the item has no
     * real movement yet.
     */
    @Query("""
            select min(coalesce(tl.transaction.eventDate, tl.transaction.entryDate))
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.item.id = :itemId
              and tl.transaction.store.id = :storeId
              and tl.transaction.event <> io.github.baeyung.hisaabkitaab.enums.TransactionEvent.OPENING_STOCK
            """)
    LocalDate findEarliestItemDate(@Param("itemId") String itemId, @Param("storeId") String storeId);

    /** Batch form of {@link #findEarliestItemDate} — one query for every item in the store, for the nightly reposition job. */
    @Query("""
            select tl.item.id as itemId,
                   min(coalesce(tl.transaction.eventDate, tl.transaction.entryDate)) as earliestDate
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.transaction.store.id = :storeId
              and tl.transaction.event <> io.github.baeyung.hisaabkitaab.enums.TransactionEvent.OPENING_STOCK
            group by tl.item.id
            """)
    List<ItemEarliestRow> findEarliestItemDatesByStore(@Param("storeId") String storeId);

    interface PartyBalanceRow
    {
        String getPartyId();

        Double getBalance();
    }

    interface ExpenseCategoryTotalRow
    {
        String getCategory();

        long getCount();

        Double getTotal();
    }

    interface CashKindTotalRow
    {
        TransactionEvent getEvent();

        long getCount();

        Double getTotal();
    }

    interface TransactionPartyNetRow
    {
        String getTransactionId();

        Double getNet();
    }

    interface PartyOpeningRow
    {
        String getPartyId();

        InOut getInOut();

        Double getValue();
    }

    interface ItemOpeningRow
    {
        String getItemId();

        BigDecimal getQuantity();
    }

    interface PartyEarliestRow
    {
        String getPartyId();

        LocalDate getEarliestDate();
    }

    interface ItemEarliestRow
    {
        String getItemId();

        LocalDate getEarliestDate();
    }

    interface ItemStockRow
    {
        String getItemId();

        BigDecimal getStock();
    }
}
