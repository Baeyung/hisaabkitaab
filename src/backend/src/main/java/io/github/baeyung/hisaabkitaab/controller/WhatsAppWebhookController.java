package io.github.baeyung.hisaabkitaab.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * WhatsApp Cloud API webhook. Meta first calls GET with a challenge to confirm we own the
 * endpoint, then POSTs every inbound message and status update. For now the payload is only
 * echoed to stdout — deliberately {@code System.out} and not a logger, so it stays out of the
 * rolling log file.
 */
@RestController
@RequestMapping("/api/webhooks/whatsapp")
public class WhatsAppWebhookController
{
    @Value("${app.whatsapp.verify-token:}")
    private String verifyToken;

    @GetMapping
    public ResponseEntity<String> verify(
            @RequestParam("hub.mode") String mode,
            @RequestParam("hub.verify_token") String token,
            @RequestParam("hub.challenge") String challenge
    )
    {
        if ("subscribe".equals(mode) && !verifyToken.isBlank() && verifyToken.equals(token))
        {
            return ResponseEntity.ok(challenge);
        }
        return ResponseEntity.status(403).build();
    }

    @PostMapping
    public ResponseEntity<Void> receive(@RequestBody String payload)
    {
        System.out.println("[whatsapp-webhook] " + payload);
        return ResponseEntity.ok().build();
    }
}
