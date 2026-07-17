package io.github.baeyung.hisaabkitaab.repository;

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
     */
    @EntityGraph(attributePaths = {"party", "lines", "lines.item"})
    @Query("""
            select t from Transaction t
            where t.store.id = :storeId and t.event = :event
            order by coalesce(t.eventDate, t.entryDate) desc, t.createdAt desc
            """)
    List<Transaction> findByStoreIdAndEventNewestFirst(@Param("storeId") String storeId, @Param("event") TransactionEvent event);

    @EntityGraph(attributePaths = {"party", "lines", "lines.item"})
    Optional<Transaction> findByIdAndStoreId(String id, String storeId);
}
