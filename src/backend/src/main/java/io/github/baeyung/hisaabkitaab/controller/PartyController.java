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
import io.github.baeyung.hisaabkitaab.dto.party.PartyWhatsAppRequest;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.OpeningEntryService;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import io.github.baeyung.hisaabkitaab.service.pdf.PdfRenderService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.PartyDocumentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/stores/{storeId}/parties")
@RequiredArgsConstructor
public class PartyController
{
    private final PartyService partyService;
    private final OpeningEntryService openingEntryService;
    private final PartyDocumentService partyDocumentService;
    private final PdfRenderService pdfRenderService;

    @GetMapping
    public ResponseEntity<List<PartyResponse>> list(@CurrentStore(StoreRole.VIEWER) Store store)
    {
        List<Party> parties = partyService.findByStore(store.getId());
        Map<String, PartyBalance> openings = openingEntryService.openingBalancesByStore(store.getId());
        return ResponseEntity.ok(parties.stream()
                .map(p -> PartyResponse.of(p, openings.get(p.getId())))
                .toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Party> get(@PathVariable String id, @CurrentStore(StoreRole.VIEWER) Store store)
    {
        return ResponseEntity.ok(partyService.findByIdForStore(id, store.getId()));
    }

    @PostMapping
    public ResponseEntity<Party> create(@Valid @RequestBody Party party, @CurrentStore(StoreRole.EDITOR) Store store)
    {
        return ResponseEntity.ok(partyService.create(party, store));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Party> update(@PathVariable String id, @Valid @RequestBody Party party,
            @CurrentStore(StoreRole.EDITOR) Store store)
    {
        return ResponseEntity.ok(partyService.update(id, party, store.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id, @CurrentStore(StoreRole.OWNER) Store store)
    {
        partyService.delete(id, store.getId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Send this party the printout the shopkeeper is looking at, as a PDF on WhatsApp.
     * The browser posts the page, not a file: the PDF is rendered here, so a client cannot
     * put arbitrary bytes on a customer's phone. The recipient's number is likewise
     * resolved from the party rather than taken from the request.
     */
    @PostMapping("/{id}/whatsapp")
    public ResponseEntity<Void> sendOnWhatsApp(@PathVariable String id,
            @Valid @RequestBody PartyWhatsAppRequest request,
            @CurrentStore(StoreRole.EDITOR) Store store)
    {
        partyDocumentService.send(partyService.findByIdForStore(id, store.getId()),
                pdfRenderService.render(request.html()),
                request.filename(),
                request.caption());
        return ResponseEntity.accepted().build();
    }

    @PutMapping("/{id}/opening-balance")
    public ResponseEntity<PartyBalance> setOpeningBalance(@PathVariable String id,
            @Valid @RequestBody OpeningBalanceRequest request,
            @CurrentStore(StoreRole.EDITOR) Store store)
    {
        return ResponseEntity.ok(
                openingEntryService.setOpeningBalance(id, store, request.amount(), request.direction()));
    }
}
