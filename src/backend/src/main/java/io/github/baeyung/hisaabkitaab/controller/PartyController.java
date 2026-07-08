package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.party.PartyRequest;
import io.github.baeyung.hisaabkitaab.dto.party.PartyResponse;
import io.github.baeyung.hisaabkitaab.service.PartyService;
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
@RequestMapping("/api/parties")
@RequiredArgsConstructor
public class PartyController
{
    private final PartyService partyService;

    @PostMapping
    public ResponseEntity<PartyResponse> create(@Valid @RequestBody PartyRequest request)
    {
        PartyResponse response = partyService.create(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public PartyResponse getById(@PathVariable String id)
    {
        return partyService.getById(id);
    }

    @GetMapping
    public List<PartyResponse> getAll(@RequestParam(required = false) String storeId)
    {
        return partyService.getAll(storeId);
    }

    @PutMapping("/{id}")
    public PartyResponse update(@PathVariable String id, @Valid @RequestBody PartyRequest request)
    {
        return partyService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id)
    {
        partyService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
