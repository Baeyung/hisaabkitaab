package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.storeitem.StoreItemRequest;
import io.github.baeyung.hisaabkitaab.dto.storeitem.StoreItemResponse;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
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
@RequestMapping("/api/store-items")
@RequiredArgsConstructor
public class StoreItemController
{
    private final StoreItemService storeItemService;

    @PostMapping
    public ResponseEntity<StoreItemResponse> create(@Valid @RequestBody StoreItemRequest request)
    {
        StoreItemResponse response = storeItemService.create(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public StoreItemResponse getById(@PathVariable String id)
    {
        return storeItemService.getById(id);
    }

    @GetMapping
    public List<StoreItemResponse> getAll(@RequestParam(required = false) String storeId)
    {
        return storeItemService.getAll(storeId);
    }

    @PutMapping("/{id}")
    public StoreItemResponse update(@PathVariable String id, @Valid @RequestBody StoreItemRequest request)
    {
        return storeItemService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id)
    {
        storeItemService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
