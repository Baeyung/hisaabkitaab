package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.OpeningEntryService;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/parties")
@RequiredArgsConstructor
public class PartyController
{
    private final PartyService partyService;
    private final OpeningEntryService openingEntryService;

    @GetMapping
    public ResponseEntity<List<PartyResponse>> list(@AuthenticationPrincipal UserPrincipal principal)
    {
        List<Party> parties = partyService.findByOwner(principal.getId());
        Map<String, PartyBalance> openings = openingEntryService.openingBalancesByOwner(principal.getId());
        return ResponseEntity.ok(parties.stream()
                .map(p -> PartyResponse.of(p, openings.get(p.getId())))
                .toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Party> get(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(partyService.findByIdForOwner(id, principal.getId()));
    }

    @PostMapping
    public ResponseEntity<Party> create(@Valid @RequestBody Party party,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(partyService.create(party, principal.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Party> update(@PathVariable String id, @Valid @RequestBody Party party,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(partyService.update(id, party, principal.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal)
    {
        partyService.delete(id, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/opening-balance")
    public ResponseEntity<PartyBalance> setOpeningBalance(@PathVariable String id,
            @Valid @RequestBody OpeningBalanceRequest request,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(
                openingEntryService.setOpeningBalance(id, principal.getId(), request.amount(), request.direction()));
    }
}
