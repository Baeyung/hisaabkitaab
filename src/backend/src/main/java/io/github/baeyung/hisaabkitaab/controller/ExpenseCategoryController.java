package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

/** The owner's expense heads, by name — the autocomplete source for the expense screen. */
@RestController
@RequestMapping("/api/expense-categories")
@RequiredArgsConstructor
public class ExpenseCategoryController
{
    private final ExpenseCategoryService expenseCategoryService;
    private final StoreService storeService;

    @GetMapping
    public ResponseEntity<List<String>> list(@AuthenticationPrincipal UserPrincipal principal)
    {
        String storeId = storeService.getPrimaryStoreForOwner(principal.getId()).getId();
        return ResponseEntity.ok(expenseCategoryService.listNames(storeId));
    }
}
