package io.github.baeyung.hisaabkitaab.repository;

import io.github.baeyung.hisaabkitaab.entity.Store;
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
}
