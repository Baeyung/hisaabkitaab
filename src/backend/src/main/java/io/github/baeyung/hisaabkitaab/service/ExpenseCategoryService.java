package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.entity.ExpenseCategory;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.repository.ExpenseCategoryRepository;
import lombok.RequiredArgsConstructor;

/**
 * The per-store list of expense heads. Every store starts with {@link #DEFAULT_NAMES}
 * (seeded on creation), and grows as shopkeepers file expenses under new names —
 * {@link #resolveOrCreate} auto-adds anything typed on the expense screen.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ExpenseCategoryService
{
    /**
     * Seeded into every new store. Kept as stable UPPER_SNAKE tokens (not display text)
     * so the frontend's bilingual labels still resolve for the defaults; see event.models.ts.
     */
    public static final List<String> DEFAULT_NAMES = List.of(
            "PARTS", "ELECTRICITY", "GENERAL", "MISC", "SALARIES", "UNCATEGORIZED");

    /** The head an expense falls under when the shopkeeper doesn't name one. */
    public static final String UNCATEGORIZED = "UNCATEGORIZED";

    private final ExpenseCategoryRepository repository;

    /** Gives a fresh store its default heads. No-op if it already has any. */
    public void seedDefaults(Store store)
    {
        if (repository.existsByStoreId(store.getId()))
        {
            return;
        }
        DEFAULT_NAMES.forEach(name -> repository.save(
                ExpenseCategory.builder().store(store).name(name).build()));
    }

    /**
     * The store's category matching {@code name} (case-insensitive), creating it if new;
     * blank falls back to {@link #UNCATEGORIZED}. This is how the expense screen's free
     * text turns into a reusable head.
     */
    public ExpenseCategory resolveOrCreate(Store store, String name)
    {
        String wanted = StringUtils.hasText(name) ? name.trim() : UNCATEGORIZED;
        return repository.findByStoreIdAndNameIgnoreCase(store.getId(), wanted)
                .orElseGet(() -> repository.save(
                        ExpenseCategory.builder().store(store).name(wanted).build()));
    }

    @Transactional(readOnly = true)
    public List<String> listNames(String storeId)
    {
        return repository.findByStoreIdOrderByNameAsc(storeId)
                .stream()
                .map(ExpenseCategory::getName)
                .toList();
    }
}
