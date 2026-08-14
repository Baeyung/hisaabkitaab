package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.units.UnitConversionRequest;
import io.github.baeyung.hisaabkitaab.dto.units.UnitConversionResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.UnitConversionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * The rates this shop measures by — what a than, a bori, a roll is worth in the unit its shelf
 * counts in. Read by every entry screen on open, and written the moment a shopkeeper answers
 * the conversion slip for a pair nobody has answered before.
 *
 * <p>{@code PUT} rather than {@code POST} because there is nothing to create twice: a pair has
 * one rate, and sending it again replaces it. Teaching one is an ordinary part of making an
 * entry, so it takes {@code EDITOR} — the same rank that may record the entry it is for.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/unit-conversions")
@RequiredArgsConstructor
public class UnitConversionController
{
    private final UnitConversionService unitConversionService;

    @GetMapping
    public ResponseEntity<List<UnitConversionResponse>> list(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(unitConversionService.findByStore(store.getId()).stream()
                .map(UnitConversionResponse::of)
                .toList());
    }

    /**
     * There is no delete. A rate is never wrong in a way that having none would fix — the
     * shopkeeper who mistyped 22 for 2.2 wants 2.2, and typing it over in the slip is what
     * lands here. Nothing in the app asks for a pair to go back to having no answer.
     */
    @PutMapping
    public ResponseEntity<UnitConversionResponse> save(@Valid @RequestBody UnitConversionRequest request,
            @CurrentStore(StoreRole.EDITOR) Store store)
    {
        return ResponseEntity.ok(UnitConversionResponse.of(unitConversionService.save(request, store)));
    }
}
