package io.github.baeyung.hisaabkitaab.service.query;

import io.github.baeyung.hisaabkitaab.dto.inventory.ItemMovementResponse;
import io.github.baeyung.hisaabkitaab.dto.inventory.ItemMovementRowResponse;
import io.github.baeyung.hisaabkitaab.dto.inventory.ItemStockResponse;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository.ItemStockRow;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Inventory: every item with its current stock (Σ IN − Σ OUT of STOCK-line
 * quantities), and the per-item movement history with a running quantity.
 * Quantities only — a STOCK line's {@code value} repeats the transaction's
 * whole cash amount and must never be summed per item.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InventoryQueryService
{
    private final StoreItemService storeItemService;
    private final StoreItemRepository storeItemRepository;
    private final TransactionLineRepository transactionLineRepository;

    public List<ItemStockResponse> listStock(String storeId)
    {
        Map<String, BigDecimal> stock = transactionLineRepository.sumStockByStore(storeId)
                .stream()
                .collect(Collectors.toMap(
                        ItemStockRow::getItemId,
                        row -> row.getStock() != null ? row.getStock() : BigDecimal.ZERO
                ));

        return storeItemRepository.findByStoreId(storeId)
                .stream()
                .sorted(Comparator.comparing(StoreItem::getName, String.CASE_INSENSITIVE_ORDER))
                .map(item -> new ItemStockResponse(
                        item.getId(),
                        item.getName(),
                        item.getUnit(),
                        item.getSalePrice(),
                        item.getCostPrice(),
                        stock.getOrDefault(item.getId(), BigDecimal.ZERO)
                ))
                .toList();
    }

    public ItemMovementResponse getMovement(String storeId, String itemId)
    {
        // findByIdForStore 404s on another store's item; the lines are then scoped to the
        // same store, so only entries posted in these books can move this stock.
        StoreItem item = storeItemService.findByIdForStore(itemId, storeId);

        List<TransactionLine> lines = transactionLineRepository.findItemMovementLines(itemId, storeId);

        List<ItemMovementRowResponse> rows = new ArrayList<>(lines.size());
        BigDecimal running = BigDecimal.ZERO;
        for (TransactionLine line : lines)
        {
            running = running.add(signedQuantity(line));
            Transaction transaction = line.getTransaction();
            rows.add(new ItemMovementRowResponse(
                    transaction.getId(),
                    transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate(),
                    transaction.getCreatedAt(),
                    transaction.getEvent(),
                    transaction.getDescription(),
                    line.getInOut(),
                    quantity(line),
                    running
            ));
        }

        return new ItemMovementResponse(item.getId(), item.getName(), item.getUnit(), running, rows);
    }

    private BigDecimal signedQuantity(TransactionLine line)
    {
        return switch (line.getInOut())
        {
            case IN -> quantity(line);
            case OUT -> quantity(line).negate();
            default -> BigDecimal.ZERO;
        };
    }

    private BigDecimal quantity(TransactionLine line)
    {
        return line.getQuantity() != null ? line.getQuantity() : BigDecimal.ZERO;
    }
}
