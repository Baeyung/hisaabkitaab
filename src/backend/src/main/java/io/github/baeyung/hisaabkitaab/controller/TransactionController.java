package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
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
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.query.TransactionQueryService;
import lombok.RequiredArgsConstructor;

/**
 * The two goods documents, read back from the transactions that recorded them: bills
 * (SALE) and purchases (PURCHASE). Both halves are the same three reads over the same
 * response shape — only the event differs — so they delegate to one query service.
 *
 * Read-only. Deleting either goes through {@code DELETE /event/{id}}, which takes back
 * an entry of any kind and carries the owner/24-hour rule for all of them.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/transactions")
@RequiredArgsConstructor
public class TransactionController
{
    private final TransactionQueryService transactionQueryService;

    @GetMapping("/bills")
    public ResponseEntity<List<BillSummaryResponse>> listBills(
            @RequestParam(required = false) String partyId,
            @RequestParam(required = false) String itemId,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(
                transactionQueryService.list(store.getId(), TransactionEvent.SALE, partyId, itemId));
    }

    @PostMapping("/bills/details")
    public ResponseEntity<List<BillDetailResponse>> getBillDetails(
            @RequestBody List<String> ids,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(
                transactionQueryService.getDetails(store.getId(), TransactionEvent.SALE, ids));
    }

    @GetMapping("/bills/{id}")
    public ResponseEntity<BillDetailResponse> getBillDetail(
            @PathVariable String id,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(
                transactionQueryService.getDetail(store.getId(), TransactionEvent.SALE, id));
    }

    @GetMapping("/purchases")
    public ResponseEntity<List<BillSummaryResponse>> listPurchases(
            @RequestParam(required = false) String partyId,
            @RequestParam(required = false) String itemId,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(
                transactionQueryService.list(store.getId(), TransactionEvent.PURCHASE, partyId, itemId));
    }

    @PostMapping("/purchases/details")
    public ResponseEntity<List<BillDetailResponse>> getPurchaseDetails(
            @RequestBody List<String> ids,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(
                transactionQueryService.getDetails(store.getId(), TransactionEvent.PURCHASE, ids));
    }

    @GetMapping("/purchases/{id}")
    public ResponseEntity<BillDetailResponse> getPurchaseDetail(
            @PathVariable String id,
            @CurrentStore(StoreRole.VIEWER) Store store
    )
    {
        return ResponseEntity.ok(
                transactionQueryService.getDetail(store.getId(), TransactionEvent.PURCHASE, id));
    }
}
