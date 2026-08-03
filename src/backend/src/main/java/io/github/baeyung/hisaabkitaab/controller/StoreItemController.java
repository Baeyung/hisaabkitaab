package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Map;

import io.github.baeyung.hisaabkitaab.dto.opening.OpeningStockRequest;
import io.github.baeyung.hisaabkitaab.dto.storeitem.StoreItemResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.OpeningEntryService;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * CRUD for the items in one store, named by {@code {storeId}}. That store is resolved and
 * ownership-checked by {@code CurrentStoreArgumentResolver}, so every operation here is
 * confined to it; an item from anywhere else is reported as {@code 404}.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/store-items")
@RequiredArgsConstructor
public class StoreItemController
{
    private final StoreItemService storeItemService;
    private final OpeningEntryService openingEntryService;

    @GetMapping
    public ResponseEntity<List<StoreItemResponse>> list(@CurrentStore Store store)
    {
        List<StoreItem> items = storeItemService.findByStore(store.getId());
        Map<String, BigDecimal> openings = openingEntryService.openingStockByStore(store.getId());
        return ResponseEntity.ok(items.stream()
                .map(it -> StoreItemResponse.of(it, openings.get(it.getId())))
                .toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<StoreItem> get(@PathVariable String id, @CurrentStore Store store)
    {
        return ResponseEntity.ok(storeItemService.findByIdForStore(id, store.getId()));
    }

    @PostMapping
    public ResponseEntity<StoreItem> create(@Valid @RequestBody StoreItem item, @CurrentStore Store store)
    {
        return ResponseEntity.ok(storeItemService.create(item, store));
    }

    @PutMapping("/{id}")
    public ResponseEntity<StoreItem> update(@PathVariable String id, @Valid @RequestBody StoreItem item,
            @CurrentStore Store store)
    {
        return ResponseEntity.ok(storeItemService.update(id, item, store.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @CurrentStore Store store)
    {
        storeItemService.delete(id, store.getId());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/opening-stock")
    public ResponseEntity<BigDecimal> setOpeningStock(@PathVariable String id,
            @Valid @RequestBody OpeningStockRequest request,
            @CurrentStore Store store)
    {
        return ResponseEntity.ok(openingEntryService.setOpeningStock(id, store, request.quantity()));
    }
}
