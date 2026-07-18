package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.transaction.BillDetailResponse;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillSummaryResponse;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import io.github.baeyung.hisaabkitaab.service.query.TransactionQueryService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/transactions")
@RequiredArgsConstructor
public class TransactionController
{
    private final TransactionQueryService transactionQueryService;
    private final TransactionService transactionService;

    @GetMapping("/bills")
    public ResponseEntity<List<BillSummaryResponse>> listBills(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(transactionQueryService.listBills(principal.getId()));
    }

    @GetMapping("/bills/{id}")
    public ResponseEntity<BillDetailResponse> getBillDetail(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal principal
    )
    {
        return ResponseEntity.ok(transactionQueryService.getBillDetail(principal.getId(), id));
    }

    @DeleteMapping("/bills/{id}")
    public ResponseEntity<Void> deleteBill(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal principal
    )
    {
        transactionService.deleteBill(principal.getId(), id);
        return ResponseEntity.noContent().build();
    }
}
