package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.ledger.CashSaleRowResponse;
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

    @GetMapping("/cash-sales")
    public ResponseEntity<List<CashSaleRowResponse>> listCashSales(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(ledgerQueryService.listCashSales(store.getId()));
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
