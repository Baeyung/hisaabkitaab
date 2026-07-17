package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.ledger.PartyBalanceResponse;
import io.github.baeyung.hisaabkitaab.dto.ledger.PartyStatementResponse;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.query.LedgerQueryService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/ledger")
@RequiredArgsConstructor
public class LedgerController
{
    private final LedgerQueryService ledgerQueryService;

    @GetMapping
    public ResponseEntity<List<PartyBalanceResponse>> listBalances(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(ledgerQueryService.listBalances(principal.getId()));
    }

    @GetMapping("/{partyId}")
    public ResponseEntity<PartyStatementResponse> getStatement(
            @PathVariable String partyId,
            @AuthenticationPrincipal UserPrincipal principal
    )
    {
        return ResponseEntity.ok(ledgerQueryService.getStatement(principal.getId(), partyId));
    }
}
