package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.transaction.TransactionRequest;
import io.github.baeyung.hisaabkitaab.dto.transaction.TransactionResponse;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/transactions")
@RequiredArgsConstructor
public class TransactionController
{
    private final TransactionService transactionService;

    @PostMapping
    public ResponseEntity<TransactionResponse> create(@Valid @RequestBody TransactionRequest request)
    {
        TransactionResponse response = transactionService.create(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public TransactionResponse getById(@PathVariable String id)
    {
        return transactionService.getById(id);
    }

    @GetMapping
    public List<TransactionResponse> getAll(
            @RequestParam(required = false) String storeId,
            @RequestParam(required = false) String partyId)
    {
        return transactionService.getAll(storeId, partyId);
    }

    @PutMapping("/{id}")
    public TransactionResponse update(@PathVariable String id, @Valid @RequestBody TransactionRequest request)
    {
        return transactionService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id)
    {
        transactionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
