package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Unit;
import io.github.baeyung.hisaabkitaab.repository.UnitRepository;
import lombok.RequiredArgsConstructor;

/**
 * The per-store list of unit names offered on entry screens. Every store starts with
 * {@link #DEFAULT_NAMES} (seeded on creation), and grows as shopkeepers type a new one on an
 * item or a conversion rate — {@link #resolveOrCreate} adds it the first time it is used, the
 * same way {@link ExpenseCategoryService} grows expense heads.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class UnitService
{
    private static final Logger log = LoggerFactory.getLogger(UnitService.class);

    /**
     * Seeded into every new store. Must match {@code UNIT_SUGGESTIONS} in the frontend's
     * core/units/units.ts — that file is what a shopkeeper who has never opened this list yet
     * sees offered, and it is what a brand-new store's rows are, so the two stay in step.
     */
    public static final List<String> DEFAULT_NAMES = List.of(
            "Meter", "Gaz", "Yard", "Inch", "Foot", "Kg", "Gram", "Maund", "Tola", "Litre",
            "Piece", "Dozen", "Pair", "Than", "Roll", "Bundle", "Bori", "Carton", "Box", "Bale",
            "Packet");

    private final UnitRepository repository;

    /** Gives a fresh store its default units. No-op if it already has any. */
    public void seedDefaults(Store store)
    {
        if (repository.existsByStoreId(store.getId()))
        {
            return;
        }
        DEFAULT_NAMES.forEach(name -> repository.save(Unit.builder().store(store).name(name).build()));
    }

    /**
     * Makes sure {@code name} is on this store's list, creating it if new. Blank is a no-op:
     * an item or rate with no unit set has nothing worth remembering. This is how a shopkeeper
     * "defines" a custom unit — by typing it once anywhere it's asked for.
     */
    public void resolveOrCreate(Store store, String name)
    {
        if (!StringUtils.hasText(name))
        {
            return;
        }
        String wanted = name.trim();
        repository.findByStoreIdAndNameIgnoreCase(store.getId(), wanted)
                .orElseGet(() -> {
                    log.info("new unit \"{}\" in store {}, learned from an entry", wanted, store.getId());
                    return repository.save(Unit.builder().store(store).name(wanted).build());
                });
    }

    /** Removes every unit of a store — used when the store itself is deleted. */
    public void deleteByStore(String storeId)
    {
        repository.deleteByStoreId(storeId);
    }

    @Transactional(readOnly = true)
    public List<String> listNames(String storeId)
    {
        return repository.findByStoreIdOrderByNameAsc(storeId)
                .stream()
                .map(Unit::getName)
                .toList();
    }
}
