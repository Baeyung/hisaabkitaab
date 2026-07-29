package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.util.List;

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

        List<TransactionLine> lines = requestItems
                .stream()
                .map(requestItem -> {
                    StoreItem item = resolveItem(requestItem, transaction);
                    TransactionLine transactionLine = getTransactionLine(
                            transaction,
                            payload.getCashAmount(),
                            inOut
                    );
                    transactionLine.setItem(item);
                    transactionLine.setQuantity(requestItem.getQuantity());
                    transactionLine.setItemSoldAt(requestItem.getItemSoldAt());
                    return transactionLine;
                })
                .toList();

        transactionLineService.upsertAll(lines);
    }

    /**
     * The line's item: an existing one by id, or a new one created from the typed name. The id
     * arrives from the client, so it is checked against the entry's store — without that, a line
     * could name another shop's item, and since the movement history is queried by item alone
     * the line would surface in <em>their</em> stock. Reported as not-found so we never leak
     * whether the id exists.
     */
    private StoreItem resolveItem(EventRequest.Item item, Transaction transaction)
    {
        if (item.getItemId() != null)
        {
            StoreItem resolved = storeItemService.findEntity(item.getItemId());
            if (!resolved.getStore().getId().equals(transaction.getStore().getId()))
            {
                throw ResourceNotFoundException.forEntity("StoreItem", item.getItemId());
            }
            return resolved;
        }

        return storeItemService.create(
                StoreItem
                        .builder()
                        .store(transaction.getStore())
                        .unit("gz")
                        .salePrice(BigDecimal.ZERO)
                        .costPrice(BigDecimal.ZERO)
                        .name(item.getName())
                        .build()
        );
    }
}
