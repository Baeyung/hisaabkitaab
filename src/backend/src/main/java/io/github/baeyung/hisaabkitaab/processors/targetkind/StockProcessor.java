package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.models.StoreSettings;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class StockProcessor implements KindProcessor
{
    private final TransactionLineService transactionLineService;
    private final StoreItemService storeItemService;

    @Override
    public TargetKind getTargetKind()
    {
        return TargetKind.STOCK;
    }

    @Override
    public void process(
            EventRequest payload,
            InOut inOut,
            TransactionEvent transactionEvent,
            Transaction transaction
    )
    {
        List<EventRequest.Item> requestItems = payload.getItems();
        if (CollectionUtils.isEmpty(requestItems))
        {
            return;
        }

        Store store = transaction.getStore();

        // Resolved once for the whole bill, for the reason ProcessingService#item gives: a
        // name that isn't in the catalogue yet has no id on any of its lines, so resolving
        // line by line would leave one catalogue row per line. A bill naming the same new
        // cloth twice is ordinary — it is what the grouped bill print exists for.
        Map<String, StoreItem> catalogue = new HashMap<>();
        // The shelf balance each item's weighted average is being taken over, carried across
        // the bill's own lines: two lots of the same thing on one bill are two lots, and the
        // second has to weigh against the first rather than against the same opening figure.
        Map<String, BigDecimal> onHand = new HashMap<>();

        List<TransactionLine> lines = requestItems
                .stream()
                .map(requestItem -> {
                    StoreItem item = resolve(requestItem, store, catalogue);
                    price(requestItem, item, transactionEvent, store, onHand);

                    TransactionLine transactionLine = getTransactionLine(
                            transaction,
                            payload.getCashAmount(),
                            inOut
                    );
                    transactionLine.setItem(item);
                    transactionLine.setQuantity(requestItem.getQuantity());
                    transactionLine.setItemSoldAt(requestItem.getItemSoldAt());
                    // Carried through untouched — the shop's own entry columns, which mean
                    // nothing on this side. The two numbers above are what stock and every
                    // total are folded from, and the entry screen has already derived them
                    // from these so that quantity × itemSoldAt is the line total it showed.
                    transactionLine.setCustomFields(requestItem.getCustomFields());
                    return transactionLine;
                })
                .toList();

        transactionLineService.upsertAll(lines);
    }

    /** The catalogue item this line names, resolved once per bill — by id where the entry
     *  screen matched one, and otherwise by the name as typed, folded for case. */
    private StoreItem resolve(EventRequest.Item requestItem, Store store, Map<String, StoreItem> catalogue)
    {
        String name = requestItem.getName() == null ? "" : requestItem.getName().trim();
        String key = StringUtils.hasText(requestItem.getItemId())
                ? requestItem.getItemId()
                : "name:" + name.toLowerCase(Locale.ROOT);

        StoreItem found = catalogue.get(key);
        if (found != null)
        {
            return found;
        }

        StoreItem item = storeItemService.resolveOrCreate(
                requestItem.getItemId(),
                requestItem.getName(),
                requestItem.getUnit(),
                store
        );
        catalogue.put(key, item);
        catalogue.putIfAbsent("name:" + item.getName().trim().toLowerCase(Locale.ROOT), item);
        return item;
    }

    /**
     * What this line does to the item's price list.
     *
     * <p>A purchase is where cost price comes from: goods arrived at a known rate, so the
     * item's cost moves to the weighted average of what was on the shelf and what just landed
     * (see {@link StoreItemService#reprice}). With nothing on hand — a name typed here for the
     * first time — that average is simply the rate paid. The selling rate rides along at the
     * item's existing margin only where the shop has asked it to, on Store Settings › Items.
     *
     * <p>A sale sets nothing on an item the catalogue already holds: the rate on the line is
     * what this customer was charged today, which is exactly the thing a shopkeeper overrides
     * bill by bill, and writing every override back into the price list would erase the price
     * list. On an item named here for the first time there is no list to erase, and the rate
     * is the only figure anybody has ever put on it, so it becomes the selling price. Cost is
     * left at zero for a purchase to fill in — a sale never knew it.
     *
     * <p>ponytail: cost is a running figure, so editing a saved purchase folds its rate in a
     * second time. Same ceiling PROCESSING has (which refuses edits outright); replay the
     * item's purchase history on edit if it starts to bite.
     */
    private void price(
            EventRequest.Item requestItem,
            StoreItem item,
            TransactionEvent transactionEvent,
            Store store,
            Map<String, BigDecimal> onHand
    )
    {
        if (requestItem.getItemSoldAt() == null || requestItem.getItemSoldAt() <= 0)
        {
            return;
        }
        BigDecimal rate = BigDecimal.valueOf(requestItem.getItemSoldAt());
        BigDecimal quantity = requestItem.getQuantity() == null ? BigDecimal.ZERO : requestItem.getQuantity();

        if (transactionEvent == TransactionEvent.PURCHASE)
        {
            BigDecimal before = onHand.computeIfAbsent(item.getId(),
                    id -> storeItemService.stockOnHand(id, store.getId()));
            storeItemService.reprice(item, before, quantity, rate, movesSalePrice(store));
            onHand.put(item.getId(), before.add(quantity));
            return;
        }

        // A name the entry screen could not match is a name the catalogue did not have.
        if (transactionEvent == TransactionEvent.SALE && !StringUtils.hasText(requestItem.getItemId()))
        {
            item.setSalePrice(rate);
            storeItemService.save(item);
        }
    }

    private boolean movesSalePrice(Store store)
    {
        StoreSettings settings = store.getSettings();
        return settings != null && settings.purchaseUpdatesSalePrice();
    }
}
