package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.UnitService;
import lombok.RequiredArgsConstructor;

/** The store's unit names, by name — the autocomplete source for every entry screen's unit box. */
@RestController
@RequestMapping("/api/stores/{storeId}/units")
@RequiredArgsConstructor
public class UnitController
{
    private final UnitService unitService;

    @GetMapping
    public ResponseEntity<List<String>> list(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(unitService.listNames(store.getId()));
    }
}
