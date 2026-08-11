package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.processing.ProcessingRequest;
import io.github.baeyung.hisaabkitaab.dto.processing.ProcessingResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.ProcessingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Processed goods. No delete of its own: a batch is an ordinary transaction, so
 * {@code DELETE /api/stores/{storeId}/event/{id}} already takes it back — along with the
 * 24-hour window a non-owner is held to. No update either; see {@code EventService}.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/processing")
@RequiredArgsConstructor
public class ProcessingController
{
    private final ProcessingService processingService;

    @GetMapping
    public ResponseEntity<List<ProcessingResponse>> list(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(processingService.list(store.getId()));
    }

    @PostMapping
    public ResponseEntity<Void> process(
            @Valid @RequestBody ProcessingRequest request,
            @CurrentStore(StoreRole.EDITOR) Store store
    )
    {
        processingService.process(request, store);
        return ResponseEntity.noContent().build();
    }
}
