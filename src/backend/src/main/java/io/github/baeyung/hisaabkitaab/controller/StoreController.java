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

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * CRUD for the authenticated user's own stores. Every operation is scoped to
 * {@code principal.getId()}, so a user only ever sees or mutates stores they own;
 * anything else is reported as {@code 404}.
 */
@RestController
@RequestMapping("/api/stores")
@RequiredArgsConstructor
public class StoreController
{
    private final StoreService storeService;

    @GetMapping
    public ResponseEntity<List<Store>> list(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeService.findByOwner(principal.getId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Store> get(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeService.findByIdForOwner(id, principal.getId()));
    }

    @PostMapping
    public ResponseEntity<Store> create(@Valid @RequestBody Store store,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeService.create(store, principal.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Store> update(@PathVariable String id, @Valid @RequestBody Store store,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeService.update(id, store, principal.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal)
    {
        storeService.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }
}
