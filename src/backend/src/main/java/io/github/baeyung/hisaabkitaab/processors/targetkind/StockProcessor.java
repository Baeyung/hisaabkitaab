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
                    // "gz" is the catalogue default for an item first named on an entry;
                    // the shopkeeper corrects it in Settings → Items if it is something else.
                    StoreItem item = storeItemService.resolveOrCreate(
                            requestItem.getItemId(),
                            requestItem.getName(),
                            "gz",
                            transaction.getStore()
                    );
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
}
