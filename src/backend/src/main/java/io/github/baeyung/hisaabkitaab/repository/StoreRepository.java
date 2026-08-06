package io.github.baeyung.hisaabkitaab.repository;

import io.github.baeyung.hisaabkitaab.entity.Store;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StoreRepository extends JpaRepository<Store, String>
{
    List<Store> findByOwnerId(String ownerId);

    /** How many shops count against this account's {@code maxStores}. Shared ones do not. */
    long countByOwnerId(String ownerId);
}
