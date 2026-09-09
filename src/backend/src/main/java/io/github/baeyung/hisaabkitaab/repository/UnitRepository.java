package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.Unit;

@Repository
public interface UnitRepository extends JpaRepository<Unit, String>
{
    List<Unit> findByStoreIdOrderByNameAsc(String storeId);

    Optional<Unit> findByStoreIdAndNameIgnoreCase(String storeId, String name);

    boolean existsByStoreId(String storeId);

    /** The store's default unit, if it has marked one. A list rather than an Optional so a
     *  document that somehow carries two is cleared rather than blowing up on read. */
    List<Unit> findByStoreIdAndDefaultUnitTrue(String storeId);

    void deleteByStoreId(String storeId);
}
