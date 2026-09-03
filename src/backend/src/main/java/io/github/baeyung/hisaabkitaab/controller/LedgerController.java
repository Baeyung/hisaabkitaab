package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.ledger.CashGroupResponse;
import io.github.baeyung.hisaabkitaab.dto.ledger.ExpenseCategoryGroupResponse;
import io.github.baeyung.hisaabkitaab.dto.ledger.PartyBalanceResponse;
import io.github.baeyung.hisaabkitaab.dto.ledger.PartyStatementResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.query.LedgerQueryService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/stores/{storeId}/ledger")
@RequiredArgsConstructor
public class LedgerController
{
    private final LedgerQueryService ledgerQueryService;

    @GetMapping
    public ResponseEntity<List<PartyBalanceResponse>> listBalances(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(ledgerQueryService.listBalances(store.getId()));
    }

    @GetMapping("/expense-categories")
    public ResponseEntity<List<ExpenseCategoryGroupResponse>> listExpenseCategories(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(ledgerQueryService.listExpenseCategories(store.getId()));
    }

    /** One spend head's entries — fetched when the shopkeeper opens the head, not with the list. */
    @GetMapping("/expense-categories/{category}")
    public ResponseEntity<ExpenseCategoryGroupResponse> getExpenseCategory(
            @PathVariable String category,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(ledgerQueryService.getExpenseCategory(store.getId(), category));
    }

    @GetMapping("/cash")
    public ResponseEntity<List<CashGroupResponse>> listCash(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(ledgerQueryService.listCash(store.getId()));
    }

    /** One walk-in cash head's entries — fetched on open, as the expense heads are. */
    @GetMapping("/cash/{kind}")
    public ResponseEntity<CashGroupResponse> getCashGroup(
            @PathVariable String kind,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(ledgerQueryService.getCashGroup(store.getId(), kind));
    }

    @GetMapping("/{partyId}")
    public ResponseEntity<PartyStatementResponse> getStatement(
            @PathVariable String partyId,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(ledgerQueryService.getStatement(store.getId(), partyId));
    }
}
