package io.github.baeyung.hisaabkitaab.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.whatsapp.BlockStatus;
import io.github.baeyung.hisaabkitaab.service.whatsapp.WhatsAppOptOutService;
import lombok.RequiredArgsConstructor;

/**
 * The way out of a shop's WhatsApp messages, for the person receiving them. Meta requires every
 * app-initiated template to carry one, and the {@code document_share} template's URL button is
 * it: it opens {@code /block/<storeId>:<partyId>} in the app, which reads and then writes here.
 *
 * <p>Public, and it has to be — whoever follows that link is a customer of the shop, not a user
 * of this application, and has nothing to sign in with. The token is the credential: two ids
 * nobody can guess, delivered only to the number they name. What it unlocks is deliberately
 * small — a shop name, the recipient's own name, the last four digits of their own number —
 * and the one thing it can change only ever makes us send less.
 *
 * <p>No rate limiting, for the same reason nothing here needs a captcha: guessing a token is
 * not feasible, and the prize for guessing one is silencing a message.
 */
@RestController
@RequestMapping("/api/block/{token}")
@RequiredArgsConstructor
public class WhatsAppBlockController
{
    private final WhatsAppOptOutService optOutService;

    @GetMapping
    public ResponseEntity<BlockStatus> status(@PathVariable String token)
    {
        return ResponseEntity.ok(optOutService.status(token));
    }

    @PostMapping
    public ResponseEntity<BlockStatus> block(@PathVariable String token)
    {
        return ResponseEntity.ok(optOutService.block(token));
    }
}
