package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.UnitConversion;

@Repository
public interface UnitConversionRepository extends JpaRepository<UnitConversion, String>
{
    List<UnitConversion> findByStoreId(String storeId);

    /**
     * The pair must already be folded and in canonical order — the service does both before
     * it gets here, so this is a plain equality match and not a case-insensitive search.
     */
    Optional<UnitConversion> findByStoreIdAndFromUnitAndToUnit(String storeId, String fromUnit, String toUnit);
}
