package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.dto.opening.OpeningBalanceRequest;
import io.github.baeyung.hisaabkitaab.dto.party.PartyResponse;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.OpeningEntryService;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/stores/{storeId}/parties")
@RequiredArgsConstructor
public class PartyController
{
    private final PartyService partyService;
    private final OpeningEntryService openingEntryService;

    @GetMapping
    public ResponseEntity<List<PartyResponse>> list(@CurrentStore Store store)
    {
        List<Party> parties = partyService.findByStore(store.getId());
        Map<String, PartyBalance> openings = openingEntryService.openingBalancesByStore(store.getId());
        return ResponseEntity.ok(parties.stream()
                .map(p -> PartyResponse.of(p, openings.get(p.getId())))
                .toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Party> get(@PathVariable String id, @CurrentStore Store store)
    {
        return ResponseEntity.ok(partyService.findByIdForStore(id, store.getId()));
    }

    @PostMapping
    public ResponseEntity<Party> create(@Valid @RequestBody Party party, @CurrentStore Store store)
    {
        return ResponseEntity.ok(partyService.create(party, store));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Party> update(@PathVariable String id, @Valid @RequestBody Party party,
            @CurrentStore Store store)
    {
        return ResponseEntity.ok(partyService.update(id, party, store.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @CurrentStore Store store)
    {
        partyService.delete(id, store.getId());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/opening-balance")
    public ResponseEntity<PartyBalance> setOpeningBalance(@PathVariable String id,
            @Valid @RequestBody OpeningBalanceRequest request,
            @CurrentStore Store store)
    {
        return ResponseEntity.ok(
                openingEntryService.setOpeningBalance(id, store, request.amount(), request.direction()));
    }
}
