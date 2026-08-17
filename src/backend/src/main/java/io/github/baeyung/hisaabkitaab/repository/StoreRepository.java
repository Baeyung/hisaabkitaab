package io.github.baeyung.hisaabkitaab.repository;

import io.github.baeyung.hisaabkitaab.entity.Store;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StoreRepository extends JpaRepository<Store, String>
{
    List<Store> findByOwnerId(String ownerId);

    /**
     * How many shops count against this account's {@code maxStores}: the ones this owner has
     * open. Shared shops belong to their own owner's plan, and suspended ones have already
     * been given up — an owner over their ceiling closes shops until this comes back under it.
     */
    long countByOwnerIdAndSuspendedAtIsNull(String ownerId);

    /**
     * Every open shop, with its owner already loaded — what the report scheduler reads once a
     * minute to find the handful whose configured time has come.
     *
     * <p>Suspended shops are left out: a shop the plan has closed is read-only and its owner is
     * over their ceiling, so it must not be sending anybody anything.
     *
     * <p>ponytail: reads every open shop each tick and matches in Java, rather than asking the
     * database for the ones due. The settings live in a JSON column, so filtering on them in
     * SQL would mean either a Postgres-specific json query — which the H2 tests could not run —
     * or a column of its own. Fine at this size; give the schedule its own column the day
     * scanning every shop a minute stops being free.
     */
    @EntityGraph(attributePaths = "owner")
    List<Store> findBySuspendedAtIsNull();
}
