package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.inventory.ItemMovementResponse;
import io.github.baeyung.hisaabkitaab.dto.inventory.ItemStockResponse;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.query.InventoryQueryService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/inventory")
@RequiredArgsConstructor
public class InventoryController
{
    private final InventoryQueryService inventoryQueryService;

    @GetMapping
    public ResponseEntity<List<ItemStockResponse>> listStock(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(inventoryQueryService.listStock(principal.getId()));
    }

    @GetMapping("/{itemId}")
    public ResponseEntity<ItemMovementResponse> getMovement(
            @PathVariable String itemId,
            @AuthenticationPrincipal UserPrincipal principal
    )
    {
        return ResponseEntity.ok(inventoryQueryService.getMovement(principal.getId(), itemId));
    }
}
