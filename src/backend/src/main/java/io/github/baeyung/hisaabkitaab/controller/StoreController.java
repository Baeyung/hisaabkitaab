package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.opening.OpeningCashRequest;
import io.github.baeyung.hisaabkitaab.dto.store.StoreSummary;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.OpeningEntryService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * The stores a user can reach: the ones they own, and the ones another owner has shared with
 * them. Reading one needs only {@code VIEWER}; changing or deleting the store itself is
 * {@code OWNER} — a shared user works <em>inside</em> a shop, never on it.
 *
 * <p>Every response is a {@link StoreSummary} rather than the entity, so the client always
 * knows which of the two it is holding and what it may do there.
 */
@RestController
@RequestMapping("/api/stores")
@RequiredArgsConstructor
public class StoreController
{
    private final StoreService storeService;
    private final OpeningEntryService openingEntryService;

    @GetMapping
    public ResponseEntity<List<StoreSummary>> list(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeService.listForUser(principal.getId()));
    }

    /** The store's opening drawer balance — the cash on hand at onboarding (0 when none set). */
    @GetMapping("/{storeId}/opening-cash")
    public ResponseEntity<Double> getOpeningCash(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(openingEntryService.openingCashByStore(store.getId()));
    }

    /** Upsert the store's opening drawer balance; zero clears it. */
    @PutMapping("/{storeId}/opening-cash")
    public ResponseEntity<Double> setOpeningCash(@Valid @RequestBody OpeningCashRequest request,
            @CurrentStore(StoreRole.EDITOR) Store store)
    {
        return ResponseEntity.ok(openingEntryService.setOpeningCash(store, request.amount()));
    }

    @GetMapping("/{storeId}")
    public ResponseEntity<StoreSummary> get(@CurrentStore(StoreRole.VIEWER) Store store,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeService.summaryOf(store.getId(), principal.getId()));
    }

    @PostMapping
    public ResponseEntity<StoreSummary> create(@Valid @RequestBody Store store,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeService.create(store, principal.getId()));
    }

    @PutMapping("/{storeId}")
    public ResponseEntity<StoreSummary> update(@Valid @RequestBody Store changes,
            @CurrentStore Store store)
    {
        return ResponseEntity.ok(storeService.update(store.getId(), changes));
    }

    /**
     * Allowed on a closed shop: an owner whose plan stopped covering a shop may still want it
     * gone rather than dormant, and refusing that would leave the shop un-deletable for as
     * long as they stay on the smaller plan.
     */
    @DeleteMapping("/{storeId}")
    public ResponseEntity<Void> delete(@CurrentStore(allowLocked = true) Store store)
    {
        storeService.delete(store.getId());
        return ResponseEntity.noContent().build();
    }
}
