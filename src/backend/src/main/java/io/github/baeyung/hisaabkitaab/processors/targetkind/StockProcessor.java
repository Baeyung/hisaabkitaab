package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
        Map<String, BigDecimal> itemQuantityMap = payload
                .getItems()
                .stream()
                .collect(Collectors.toMap(
                        EventRequest.Item::getItemId,
                        EventRequest.Item::getQuantity
                ));

        List<TransactionLine> items = resolveItems(payload, transaction)
                .stream()
                .map(item -> {
                    TransactionLine transactionLine = getTransactionLine(
                            transaction,
                            payload.getCashAmount(),
                            inOut
                    );
                    transactionLine.setItem(item);
                    transactionLine.setQuantity(itemQuantityMap.get(item.getId()));
                    return transactionLine;
                })
                .toList();

        transactionLineService.upsertAll(items);
    }

    private List<StoreItem> resolveItems(EventRequest eventRequest, Transaction transaction)
    {
        List<EventRequest.Item> items = eventRequest.getItems();
        if (CollectionUtils.isEmpty(items))
        {
            return Collections.emptyList();
        }

        return items
                .stream()
                .map(item -> {
                    if (item.getItemId() != null)
                    {
                        return storeItemService.findEntity(item.getItemId());
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
                })
                .toList();
    }
}
