package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;
import lombok.RequiredArgsConstructor;

/** The store's expense heads, by name — the autocomplete source for the expense screen. */
@RestController
@RequestMapping("/api/stores/{storeId}/expense-categories")
@RequiredArgsConstructor
public class ExpenseCategoryController
{
    private final ExpenseCategoryService expenseCategoryService;

    @GetMapping
    public ResponseEntity<List<String>> list(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(expenseCategoryService.listNames(store.getId()));
    }
}
