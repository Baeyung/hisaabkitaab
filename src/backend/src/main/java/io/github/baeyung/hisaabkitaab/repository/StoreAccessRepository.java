package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.StoreAccess;

@Repository
public interface StoreAccessRepository extends JpaRepository<StoreAccess, String>
{
    Optional<StoreAccess> findByStoreIdAndUserId(String storeId, String userId);

    /** The store's members, owner excluded — they hold no row here. */
    List<StoreAccess> findByStoreId(String storeId);

    /** Every store shared *with* this user; says nothing about the ones they own. */
    List<StoreAccess> findByUserId(String userId);

    void deleteByStoreId(String storeId);
}
