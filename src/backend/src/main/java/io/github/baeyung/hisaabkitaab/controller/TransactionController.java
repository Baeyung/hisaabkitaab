package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.transaction.BillDetailResponse;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillSummaryResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import io.github.baeyung.hisaabkitaab.service.query.TransactionQueryService;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/stores/{storeId}/transactions")
@RequiredArgsConstructor
public class TransactionController
{
    private final TransactionQueryService transactionQueryService;
    private final TransactionService transactionService;

    @GetMapping("/bills")
    public ResponseEntity<List<BillSummaryResponse>> listBills(
            @RequestParam(required = false) String partyId,
            @RequestParam(required = false) String itemId,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(transactionQueryService.listBills(store.getId(), partyId, itemId));
    }

    @PostMapping("/bills/details")
    public ResponseEntity<List<BillDetailResponse>> getBillDetails(
            @RequestBody List<String> ids,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(transactionQueryService.getBillDetails(store.getId(), ids));
    }

    @GetMapping("/bills/{id}")
    public ResponseEntity<BillDetailResponse> getBillDetail(
            @PathVariable String id,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(transactionQueryService.getBillDetail(store.getId(), id));
    }

    @DeleteMapping("/bills/{id}")
    public ResponseEntity<Void> deleteBill(
            @PathVariable String id,
            @CurrentStore(StoreRole.EDITOR) Store store,
            @AuthenticationPrincipal UserPrincipal principal
    )
    {
        transactionService.deleteBill(store.getId(), id, !store.isOwnedBy(principal.getId()));
        return ResponseEntity.noContent().build();
    }
}
