package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

import io.github.baeyung.hisaabkitaab.dto.opening.OpeningStockRequest;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.OpeningEntryService;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * CRUD for items in the authenticated user's store. The store is derived from the
 * principal (their primary store), so the client never supplies a store id, and every
 * operation is scoped to items the user owns; anything else is reported as {@code 404}.
 */
@RestController
@RequestMapping("/api/store-items")
@RequiredArgsConstructor
public class StoreItemController
{
    private final StoreItemService storeItemService;
    private final OpeningEntryService openingEntryService;

    @GetMapping
    public ResponseEntity<List<StoreItem>> list(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeItemService.findByOwner(principal.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<StoreItem> get(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeItemService.findByIdForOwner(id, principal.getId()));
    }

    @PostMapping
    public ResponseEntity<StoreItem> create(@Valid @RequestBody StoreItem item,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeItemService.create(item, principal.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<StoreItem> update(@PathVariable String id, @Valid @RequestBody StoreItem item,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeItemService.update(id, item, principal.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal)
    {
        storeItemService.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/opening-stock")
    public ResponseEntity<BigDecimal> setOpeningStock(@PathVariable String id,
            @Valid @RequestBody OpeningStockRequest request,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(openingEntryService.setOpeningStock(id, principal.getId(), request.quantity()));
    }
}
