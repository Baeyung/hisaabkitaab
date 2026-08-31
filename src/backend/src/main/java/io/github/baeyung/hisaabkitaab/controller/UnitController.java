package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.units.UnitRenameRequest;
import io.github.baeyung.hisaabkitaab.dto.units.UnitResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.UnitService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * The store's units — the autocomplete source for every entry screen's unit box, and the
 * Manage Units section of the Units screen where a shopkeeper renames or removes one.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/units")
@RequiredArgsConstructor
public class UnitController
{
    private final UnitService unitService;

    @GetMapping
    public ResponseEntity<List<UnitResponse>> list(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(unitService.list(store.getId()).stream().map(UnitResponse::of).toList());
    }

    @PatchMapping("/{id}")
    public ResponseEntity<UnitResponse> rename(@PathVariable String id,
            @Valid @RequestBody UnitRenameRequest request, @CurrentStore(StoreRole.EDITOR) Store store)
    {
        return ResponseEntity.ok(UnitResponse.of(unitService.rename(store, id, request.name())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @CurrentStore(StoreRole.EDITOR) Store store)
    {
        unitService.delete(store, id);
        return ResponseEntity.noContent().build();
    }
}
