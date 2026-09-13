package io.github.baeyung.hisaabkitaab.controller;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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

    /** The expense and cash heads take an optional business-date range; either bound left off is open-ended. */
    @GetMapping("/expense-categories")
    public ResponseEntity<List<ExpenseCategoryGroupResponse>> listExpenseCategories(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(ledgerQueryService.listExpenseCategories(store.getId(), lower(from), upper(to)));
    }

    /** One spend head's entries — fetched when the shopkeeper opens the head, not with the list. */
    @GetMapping("/expense-categories/{category}")
    public ResponseEntity<ExpenseCategoryGroupResponse> getExpenseCategory(
            @PathVariable String category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(ledgerQueryService.getExpenseCategory(store.getId(), category, lower(from), upper(to)));
    }

    @GetMapping("/cash")
    public ResponseEntity<List<CashGroupResponse>> listCash(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(ledgerQueryService.listCash(store.getId(), lower(from), upper(to)));
    }

    /** One walk-in cash head's entries — fetched on open, as the expense heads are. */
    @GetMapping("/cash/{kind}")
    public ResponseEntity<CashGroupResponse> getCashGroup(
            @PathVariable String kind,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(ledgerQueryService.getCashGroup(store.getId(), kind, lower(from), upper(to)));
    }

    // Bound as dates rather than null-guarded in JPQL: a typed bound is what every database
    // agrees on, and the year 9999 is as far as a Postgres date needs to go.
    private static LocalDate lower(LocalDate from)
    {
        return from != null ? from : LocalDate.EPOCH;
    }

    private static LocalDate upper(LocalDate to)
    {
        return to != null ? to : LocalDate.of(9999, 12, 31);
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
