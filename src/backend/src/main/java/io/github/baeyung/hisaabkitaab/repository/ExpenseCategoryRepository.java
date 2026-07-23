package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.ExpenseCategory;

@Repository
public interface ExpenseCategoryRepository extends JpaRepository<ExpenseCategory, String>
{
    List<ExpenseCategory> findByStoreIdOrderByNameAsc(String storeId);

    Optional<ExpenseCategory> findByStoreIdAndNameIgnoreCase(String storeId, String name);

    boolean existsByStoreId(String storeId);

    void deleteByStoreId(String storeId);
}
