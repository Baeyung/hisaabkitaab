package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Outbound messages over the WhatsApp Cloud API — the send side of the same integration
 * {@code WhatsAppWebhookController} receives on. Mirrors {@code MailService}: a single
 * choke point that every outgoing message routes through, switched off by default so a
 * dev machine never reaches Meta.
 * <p>
 * Failures are logged rather than thrown — a customer's message not going out is not grounds
 * to fail the shopkeeper's request — but every send says whether it actually left, so a
 * caller that is charging for the message can tell delivered from dropped. A suppressed send
 * (switched off, or unconfigured) reports false for the same reason: nothing went anywhere.
 * <p>
 * Do not autowire this directly in other non-WhatsApp services — create a specific
 * action-related service (as {@code service/mail} does), autowire there, and send from it.
 */
@Service
public class WhatsAppService {
    private static final Logger log = LoggerFactory.getLogger(WhatsAppService.class);

    // ponytail: PDFs are the only documents we send. Add a mimeType parameter when that changes.
    private static final String DOCUMENT_MIME_TYPE = "application/pdf";

    private final RestClient client;

    private final String phoneNumberId;

    /**
     * Both the {@code enabled} flag and usable credentials — either missing means send nothing.
     */
    private final boolean enabled;

    @Autowired
    WhatsAppService(
            @Value("${app.whatsapp.enabled:false}") boolean enabled,
            @Value("${app.whatsapp.api-base-url:https://graph.facebook.com/v25.0}") String apiBaseUrl,
            @Value("${app.whatsapp.phone-number-id:}") String phoneNumberId,
            @Value("${app.whatsapp.access-token:}") String accessToken
    ) {
        this(RestClient.builder().requestFactory(timeouts()), enabled, apiBaseUrl, phoneNumberId, accessToken);
    }

    /**
     * Visible for tests, which bind a {@code MockRestServiceServer} to the builder.
     */
    WhatsAppService(
            RestClient.Builder builder,
            boolean enabled,
            String apiBaseUrl,
            String phoneNumberId,
            String accessToken
    ) {
        this.phoneNumberId = phoneNumberId;
        this.enabled = enabled && !phoneNumberId.isBlank() && !accessToken.isBlank();
        this.client = builder
                .baseUrl(apiBaseUrl)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .build();
    }

    /**
     * A pre-approved template — the only thing Meta delivers to someone who has not messaged
     * us in the last 24 hours, so this is what any app-initiated message must use.
     * <p>
     * {@code bodyParameters} fill the template's {{1}}, {{2}}, … placeholders in order, and
     * must match the approved template exactly in count or Meta rejects the send. A template
     * with no placeholders takes none. {@code languageCode} is the template's own locale
     * ({@code en_US}, {@code ur}) — a template exists per language, so the caller picks.
     */
    public boolean sendTemplate(String to, String templateName, String languageCode, String... bodyParameters) {
        if (suppressed(to, templateName)) {
            return false;
        }
        try {
            postMessage(message(to, "template", template(templateName, languageCode, null, bodyParameters)));
            return true;
        } catch (Exception e) {
            logFailure(to, templateName, e);
            return false;
        }
    }

    /**
     * The same template, carrying a PDF in its header — how an app-initiated invoice or
     * statement reaches someone outside the 24-hour window. The template must already be
     * approved with a <em>document</em> header; the file is uploaded first and referenced by
     * media id, so it never has to be publicly hosted.
     */
    public boolean sendTemplateWithDocument(
            String to,
            String templateName,
            String languageCode,
            byte[] document,
            String filename,
            String... bodyParameters
    ) {
        if (suppressed(to, templateName)) {
            return false;
        }
        try {
            Map<String, Object> header = Map.of(
                    "type", "header",
                    "parameters", List.of(Map.of(
                            "type", "document",
                            "document", Map.of("id", uploadMedia(document, filename), "filename", filename)
                    ))
            );

            postMessage(message(to, "template", template(templateName, languageCode, header, bodyParameters)));
            return true;
        } catch (Exception e) {
            logFailure(to, templateName, e);
            return false;
        }
    }

    /**
     * Header first, then body — Meta reads components in the order the template declares them.
     */
    private Map<String, Object> template(
            String templateName,
            String languageCode,
            Map<String, Object> header,
            String[] bodyParameters
    ) {
        List<Map<String, Object>> components = new ArrayList<>();
        if (header != null) {
            components.add(header);
        }
        if (bodyParameters.length > 0) {
            components.add(Map.of(
                    "type", "body",
                    "parameters", Arrays.stream(bodyParameters)
                            .map(value -> Map.of("type", "text", "text", value))
                            .toList()
            ));
        }

        Map<String, Object> template = new LinkedHashMap<>();
        template.put("name", templateName);
        template.put("language", Map.of("code", languageCode));
        if (!components.isEmpty()) {
            template.put("components", components);
        }
        return template;
    }

    /**
     * A plain text message. Meta only delivers free-form text inside the 24-hour window
     * opened by the recipient's last inbound message — so this is for replying to someone
     * who wrote to us. Anything we initiate has to go through
     * {@link #sendTemplate(String, String, String, String...)}.
     */
    public boolean sendText(String to, String body) {
        if (suppressed(to, "text message")) {
            return false;
        }
        try {
            postMessage(message(to, "text", Map.of("preview_url", false, "body", body)));
            return true;
        } catch (Exception e) {
            logFailure(to, "text message", e);
            return false;
        }
    }

    /**
     * A PDF, uploaded to Meta first and then sent by the media id it hands back — so the
     * file never has to be publicly hosted. {@code caption} may be null or blank.
     * <p>
     * Free-form like {@link #sendText}, so it is bound by the same 24-hour window. Pushing a
     * document unprompted needs a template with a document header instead — not built yet.
     */
    public boolean sendDocument(String to, byte[] document, String filename, String caption) {
        if (suppressed(to, filename)) {
            return false;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", uploadMedia(document, filename));
            payload.put("filename", filename);
            if (caption != null && !caption.isBlank()) {
                payload.put("caption", caption);
            }

            postMessage(message(to, "document", payload));
            return true;
        } catch (Exception e) {
            logFailure(to, filename, e);
            return false;
        }
    }

    /**
     * Meta is a third party on the request thread — never wait on it indefinitely.
     */
    private static ClientHttpRequestFactory timeouts() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(15));
        return factory;
    }

    /**
     * Uploads the bytes and returns Meta's media id, which is valid for 30 days.
     */
    private String uploadMedia(byte[] document, String filename) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("messaging_product", "whatsapp");
        form.add("type", DOCUMENT_MIME_TYPE);
        form.add("file", new ByteArrayResource(document) {
            @Override
            public String getFilename() {
                return filename;
            }
        });

        Map<?, ?> response = client.post()
                .uri("/{phoneNumberId}/media", phoneNumberId)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form)
                .retrieve()
                .body(Map.class);

        return String.valueOf(response.get("id"));
    }

    private void postMessage(Map<String, Object> payload) {
        Map<?, ?> response = client.post()
                .uri("/{phoneNumberId}/messages", phoneNumberId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(Map.class);

        log.debug("WhatsApp accepted message: {}", response);
    }

    private Map<String, Object> message(String to, String type, Object content) {
        return Map.of(
                "messaging_product", "whatsapp",
                "recipient_type", "individual",
                // Numbers are stored as 923001234567, but strip anything a "+" or spacing
                // convention leaves behind — Meta rejects the whole request otherwise.
                "to", to.replaceAll("\\D", ""),
                "type", type,
                type, content
        );
    }

    /**
     * True when WhatsApp is switched off or unconfigured, in which case the caller must
     * return without sending.
     */
    private boolean suppressed(String to, String what) {
        if (enabled) {
            return false;
        }
        log.info("WhatsApp disabled (app.whatsapp.enabled / credentials), not sending \"{}\" to {}", what, to);
        return true;
    }

    private void logFailure(String to, String what, Exception e) {
        if (e instanceof RestClientResponseException response) {
            // Meta puts the actual reason (bad token, 24-hour window, unknown recipient)
            // in the body, not the status line.
            log.error("WhatsApp rejected \"{}\" for {}: {}", what, to, response.getResponseBodyAsString(), e);
            return;
        }
        log.error("WhatsApp send of \"{}\" to {} failed: {}", what, to, e.getMessage(), e);
    }
}
