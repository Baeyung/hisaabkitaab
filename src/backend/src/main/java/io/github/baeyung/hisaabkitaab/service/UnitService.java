package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Unit;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
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

    /** The store's units, for the Manage Units screen — same rows {@link #listNames} reads,
     *  with the id a rename or delete needs to target one. */
    @Transactional(readOnly = true)
    public List<Unit> list(String storeId)
    {
        return repository.findByStoreIdOrderByNameAsc(storeId);
    }

    /**
     * Renames a unit, refusing a name that already belongs to another unit of this store
     * (see {@link #refuseDuplicate}). The rename only relabels this row: an item or a past
     * entry recorded under the old name keeps it, since neither stores a reference to this
     * table, only the text as typed.
     */
    public Unit rename(Store store, String id, String name)
    {
        Unit unit = findByIdForStore(id, store.getId());
        String wanted = name.trim();
        refuseDuplicate(store.getId(), wanted, id);

        log.info("renaming unit {} \"{}\" -> \"{}\" in store {}", id, unit.getName(), wanted, store.getId());
        unit.setName(wanted);
        return repository.save(unit);
    }

    /**
     * Adds a name to this store's list — the deliberate way to define a unit, beside
     * {@link #resolveOrCreate}'s incidental one. Unlike that method a name the store already
     * has is refused rather than quietly ignored: the shopkeeper asked for a new unit and is
     * owed the answer that it is already there.
     */
    public Unit create(Store store, String name)
    {
        String wanted = name.trim();
        refuseDuplicate(store.getId(), wanted, null);

        log.info("new unit \"{}\" in store {}, added from Manage Units", wanted, store.getId());
        return repository.save(Unit.builder().store(store).name(wanted).build());
    }

    /** One name per store, case-insensitively — the same rule {@link #resolveOrCreate} keeps
     *  when a name is typed for the first time, so "Meter" and "meter" never become two rows
     *  down any of the three doors. {@code exceptId} is the row being renamed, if any. */
    private void refuseDuplicate(String storeId, String wanted, String exceptId)
    {
        repository.findByStoreIdAndNameIgnoreCase(storeId, wanted)
                .filter(existing -> !existing.getId().equals(exceptId))
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "A unit named \"" + wanted + "\" already exists.");
                });
    }

    /** Drops a unit from this store's offered list. Nothing else references this row — an
     *  item, a transaction line or a conversion rate carries the unit as its own text, not a
     *  link to it — so removing it only narrows what a shopkeeper is offered from here on. */
    public void delete(Store store, String id)
    {
        Unit unit = findByIdForStore(id, store.getId());
        log.info("deleting unit {} \"{}\" from store {}", id, unit.getName(), store.getId());
        repository.delete(unit);
    }

    private Unit findByIdForStore(String id, String storeId)
    {
        return repository.findById(id)
                .filter(u -> u.getStore().getId().equals(storeId))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Unit", id));
    }
}
