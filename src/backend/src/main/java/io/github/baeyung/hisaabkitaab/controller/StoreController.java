package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.store.StoreRequest;
import io.github.baeyung.hisaabkitaab.dto.store.StoreResponse;
import io.github.baeyung.hisaabkitaab.service.StoreService;
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
@RequestMapping("/api/stores")
@RequiredArgsConstructor
public class StoreController
{
    private final StoreService storeService;

    @PostMapping
    public ResponseEntity<StoreResponse> create(@Valid @RequestBody StoreRequest request)
    {
        StoreResponse response = storeService.create(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public StoreResponse getById(@PathVariable String id)
    {
        return storeService.getById(id);
    }

    @GetMapping
    public List<StoreResponse> getAll(@RequestParam(required = false) String ownerId)
    {
        return storeService.getAll(ownerId);
    }

    @PutMapping("/{id}")
    public StoreResponse update(@PathVariable String id, @Valid @RequestBody StoreRequest request)
    {
        return storeService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id)
    {
        storeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
