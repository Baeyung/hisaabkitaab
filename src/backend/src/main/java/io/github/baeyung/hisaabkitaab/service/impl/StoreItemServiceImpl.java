package io.github.baeyung.hisaabkitaab.service.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.UnitService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreItemServiceImpl implements StoreItemService
{
    private static final Logger log = LoggerFactory.getLogger(StoreItemServiceImpl.class);

    /** Same scale a processing batch has always priced at — four places is enough to keep a
     *  weighted average from drifting over a few hundred lots, and it is the figure the Items
     *  screen shows. */
    private static final int COST_SCALE = 4;

    private final StoreItemRepository storeItemRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;
    private final UnitService unitService;

    @Override
    @Transactional(readOnly = true)
    public StoreItem findEntity(String id)
    {
        return storeItemRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<StoreItem> findByStore(String storeId)
    {
        return storeItemRepository.findByStoreId(storeId);
    }

    @Override
    @Transactional(readOnly = true)
    public StoreItem findByIdForStore(String id, String storeId)
    {
        // An item in another store is reported as not-found so we never leak its existence.
        return storeItemRepository.findById(id)
                .filter(item -> item.getStore().getId().equals(storeId))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", id));
    }

    @Override
    public StoreItem create(StoreItem input, Store store)
    {
        StoreItem item = StoreItem.builder()
                .store(store)
                .name(input.getName())
                .unit(input.getUnit())
                .salePrice(input.getSalePrice())
                .costPrice(input.getCostPrice())
                .service(input.isService())
                .build();

        StoreItem saved = storeItemRepository.save(item);
        unitService.resolveOrCreate(store, saved.getUnit());
        log.info("created item {} \"{}\" ({}) in store {}",
                saved.getId(), saved.getName(), saved.getUnit(), store.getId());
        return saved;
    }

    @Override
    public StoreItem save(StoreItem input)
    {
        return storeItemRepository.save(input);
    }

    @Override
    public StoreItem resolveOrCreate(String itemId, String name, String unit, Store store)
    {
        if (StringUtils.hasText(itemId))
        {
            return findByIdForStore(itemId, store.getId());
        }

        // The line's own unit, or — when it carried none, which is every line in a shop that
        // has switched the unit box off — whatever this shop has marked default. Null past
        // that: an item with no unit reads as unitless everywhere, which is honest, where the
        // hardcoded "gz" this used to create was a guess wrong in most shops.
        String wanted = StringUtils.hasText(unit) ? unit.trim() : unitService.defaultName(store.getId());

        // Same reasoning as PartyServiceImpl.resolveOrCreate: an item born inside an entry
        // rather than on the items page is where an unexplained duplicate comes from.
        log.info("no item id on the entry, creating \"{}\" ({}) in store {}", name, wanted, store.getId());

        unitService.resolveOrCreate(store, wanted);
        return storeItemRepository.save(StoreItem.builder()
                .store(store)
                .name(name)
                .unit(wanted)
                .salePrice(BigDecimal.ZERO)
                .costPrice(BigDecimal.ZERO)
                .build());
    }

    @Override
    @Transactional(readOnly = true)
    public BigDecimal stockOnHand(String itemId, String storeId)
    {
        BigDecimal stock = transactionLineRepository.sumStockByItem(itemId, storeId);
        return stock == null ? BigDecimal.ZERO : stock;
    }

    /**
     * <p>With nothing on hand — a brand-new item, or one sold down to exactly nothing — there
     * is nothing to weight against and the lot simply sets the price. A <em>negative</em>
     * balance still averages: it means the books say goods left that never arrived, and
     * silently ignoring that would hide it. Only the case where the two sides cancel out
     * exactly is refused, because that divides by zero.
     *
     * <p>{@code moveSalePrice} carries the selling rate along at the margin the item already
     * had, so a shop that sells this at cost + 20% keeps selling it at cost + 20% without
     * retyping the price. An item with no margin to read — no sale price, or no cost price to
     * measure one against — is left alone rather than given an invented one. A processing
     * batch always does this (the output is priced by the batch and nothing else); a purchase
     * only where the shop has asked for it on Store Settings › Items.
     */
    @Override
    public StoreItem reprice(StoreItem item, BigDecimal stockBefore, BigDecimal quantity,
            BigDecimal unitCost, boolean moveSalePrice)
    {
        BigDecimal oldCost = item.getCostPrice();
        BigDecimal oldSale = item.getSalePrice();
        BigDecimal combined = stockBefore.add(quantity);

        BigDecimal newCost = oldCost == null || oldCost.signum() == 0
                || stockBefore.signum() == 0 || combined.signum() == 0
                ? unitCost
                : stockBefore.multiply(oldCost)
                        .add(quantity.multiply(unitCost))
                        .divide(combined, COST_SCALE, RoundingMode.HALF_UP);

        item.setCostPrice(newCost);

        if (moveSalePrice && oldSale != null && oldCost != null && oldCost.signum() > 0)
        {
            item.setSalePrice(newCost.multiply(oldSale).divide(oldCost, COST_SCALE, RoundingMode.HALF_UP));
        }

        return storeItemRepository.save(item);
    }

    @Override
    public StoreItem update(String id, StoreItem changes, String storeId)
    {
        StoreItem item = findByIdForStore(id, storeId);

        log.info("updating item {} \"{}\" in store {}: name \"{}\", unit {}, sale {}, cost {}",
                id, item.getName(), storeId, changes.getName(), changes.getUnit(),
                changes.getSalePrice(), changes.getCostPrice());

        item.setName(changes.getName());
        item.setUnit(changes.getUnit());
        item.setSalePrice(changes.getSalePrice());
        item.setCostPrice(changes.getCostPrice());
        item.setService(changes.isService());

        unitService.resolveOrCreate(item.getStore(), item.getUnit());
        return storeItemRepository.save(item);
    }

    @Override
    public void delete(String id, String storeId)
    {
        StoreItem item = findByIdForStore(id, storeId);
        long startedAt = System.nanoTime();

        // Cascade: delete every transaction that used this item (their lines go via orphanRemoval).
        List<Transaction> transactions = transactionLineRepository.findByItemId(id).stream()
                .map(TransactionLine::getTransaction)
                .distinct()
                .toList();

        // Logged before the work and with the count, for the reason given at
        // PartyServiceImpl.delete: the cost is unbounded in the data, so a slow delete has to
        // be tellable from a stuck one.
        log.info("deleting item {} \"{}\" from store {}, cascading {} transaction(s)",
                id, item.getName(), storeId, transactions.size());

        transactionRepository.deleteAll(transactions);
        storeItemRepository.delete(item);

        log.info("deleted item {} and its {} transaction(s) in {}ms",
                id, transactions.size(), (System.nanoTime() - startedAt) / 1_000_000);
    }
}
