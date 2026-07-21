package io.github.baeyung.hisaabkitaab.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;

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

    /** Every CASH line from {@code from} to {@code to} inclusive, chronological, with transaction and party fetched for row display. */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            left join fetch t.party
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and t.store.id = :storeId
              and coalesce(t.eventDate, t.entryDate) between :from and :to
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findCashLinesInRange(@Param("storeId") String storeId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Every EXPENSE cash-out line for the store, chronological — grouped by category into the khata's spend heads. */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            left join fetch tl.expenseCategory
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.CASH
              and t.event = io.github.baeyung.hisaabkitaab.enums.TransactionEvent.EXPENSE
              and t.store.id = :storeId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findExpenseLinesByStore(@Param("storeId") String storeId);

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

    /** Every PARTY line for one party, chronological by business date — the khata statement rows. */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and tl.party.id = :partyId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findPartyLedgerLines(@Param("partyId") String partyId);

    /**
     * Every PARTY line for the store, chronological, with party fetched — the raw
     * material for receivable aging: FIFO payments against charges to find how long
     * each party's oldest still-unpaid amount has sat.
     */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            join fetch tl.party
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.PARTY
              and t.store.id = :storeId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findPartyLinesByStore(@Param("storeId") String storeId);

    /** One net stock quantity per item over its full STOCK-line history. */
    @Query("""
            select tl.item.id as itemId,
                   sum(case when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.IN then tl.quantity
                            when tl.inOut = io.github.baeyung.hisaabkitaab.enums.InOut.OUT then -tl.quantity
                            else 0 end) as stock
            from TransactionLine tl
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.transaction.store.id = :storeId
            group by tl.item.id
            """)
    List<ItemStockRow> sumStockByStore(@Param("storeId") String storeId);

    /** Every STOCK line for one item, chronological by business date — the movement history rows. */
    @Query("""
            select tl from TransactionLine tl
            join fetch tl.transaction t
            where tl.targetKind = io.github.baeyung.hisaabkitaab.enums.TargetKind.STOCK
              and tl.item.id = :itemId
            order by coalesce(t.eventDate, t.entryDate) asc, t.createdAt asc, tl.id asc
            """)
    List<TransactionLine> findItemMovementLines(@Param("itemId") String itemId);

    /**
     * Every goods-out line of a SALE in {@code from..to}, with transaction and item fetched —
     * the dashboard's raw material for daily sales, profit (line qty×itemSoldAt − qty×costPrice),
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

    interface PartyBalanceRow
    {
        String getPartyId();

        Double getBalance();
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

    interface ItemStockRow
    {
        String getItemId();

        BigDecimal getStock();
    }
}
