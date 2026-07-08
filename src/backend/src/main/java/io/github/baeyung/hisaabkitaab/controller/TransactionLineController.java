package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.transactionline.TransactionLineRequest;
import io.github.baeyung.hisaabkitaab.dto.transactionline.TransactionLineResponse;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
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
@RequestMapping("/api/transaction-lines")
@RequiredArgsConstructor
public class TransactionLineController
{
    private final TransactionLineService transactionLineService;

    @PostMapping
    public ResponseEntity<TransactionLineResponse> create(@Valid @RequestBody TransactionLineRequest request)
    {
        TransactionLineResponse response = transactionLineService.create(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public TransactionLineResponse getById(@PathVariable String id)
    {
        return transactionLineService.getById(id);
    }

    @GetMapping
    public List<TransactionLineResponse> getAll(
            @RequestParam(required = false) String transactionId,
            @RequestParam(required = false) String partyId,
            @RequestParam(required = false) String itemId)
    {
        return transactionLineService.getAll(transactionId, partyId, itemId);
    }

    @PutMapping("/{id}")
    public TransactionLineResponse update(@PathVariable String id, @Valid @RequestBody TransactionLineRequest request)
    {
        return transactionLineService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id)
    {
        transactionLineService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
