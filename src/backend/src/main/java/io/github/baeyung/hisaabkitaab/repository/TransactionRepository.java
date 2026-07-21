package io.github.baeyung.hisaabkitaab.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, String>
{
    List<Transaction> findByStoreId(String storeId);

    List<Transaction> findByStoreIdOrderByEventDateDesc(String storeId);

    List<Transaction> findByPartyId(String partyId);

    /**
     * Bill list: SALE transactions with party and lines fetched — the amount needs every STOCK
     * line anyway. Ordered by the same coalesced business date the response displays, so a bill
     * saved without a bill date sorts by its entry date instead of NULLS FIRST-ing to the top.
     * The optional party/item filters are null-guarded so an absent filter is a no-op; the
     * {@code exists} keeps item filtering from multiplying rows the way a fetch-join would.
     */
    @EntityGraph(attributePaths = {"party", "lines", "lines.item"})
    @Query("""
            select t from Transaction t
            where t.store.id = :storeId and t.event = :event
              and (:partyId is null or t.party.id = :partyId)
              and (:itemId is null or exists (
                    select 1 from TransactionLine l where l.transaction = t and l.item.id = :itemId))
            order by coalesce(t.eventDate, t.entryDate) desc, t.createdAt desc
            """)
    List<Transaction> findBillsFiltered(
            @Param("storeId") String storeId,
            @Param("event") TransactionEvent event,
            @Param("partyId") String partyId,
            @Param("itemId") String itemId);

    @EntityGraph(attributePaths = {"party", "lines", "lines.item"})
    Optional<Transaction> findByIdAndStoreId(String id, String storeId);

    /** The single opening-balance transaction for a party, if one has been set (see OpeningEntryService). */
    @EntityGraph(attributePaths = {"lines"})
    Optional<Transaction> findFirstByStoreIdAndEventAndPartyId(String storeId, TransactionEvent event, String partyId);

    /** The single opening-stock transaction holding an item's opening line, if one has been set. */
    @EntityGraph(attributePaths = {"lines"})
    Optional<Transaction> findFirstByStoreIdAndEventAndLinesItemId(String storeId, TransactionEvent event, String itemId);

    /** The single store-level transaction for a store-wide event (opening drawer cash), if one has been set. */
    @EntityGraph(attributePaths = {"lines"})
    Optional<Transaction> findFirstByStoreIdAndEvent(String storeId, TransactionEvent event);

    /** The store's earliest business date across all transactions — null when it has none yet. */
    @Query("select min(coalesce(t.eventDate, t.entryDate)) from Transaction t where t.store.id = :storeId")
    LocalDate findEarliestEntryDate(@Param("storeId") String storeId);
}
