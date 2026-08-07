package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.time.Duration;
import java.util.LinkedHashMap;
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
 * Failures are logged and swallowed; callers treat a suppressed or failed send as success,
 * exactly as they do for mail.
 * <p>
 * Do not autowire this directly in other non-WhatsApp services — create a specific
 * action-related service (as {@code service/mail} does), autowire there, and send from it.
 */
@Service
public class WhatsAppService
{
    private static final Logger log = LoggerFactory.getLogger(WhatsAppService.class);

    // ponytail: PDFs are the only documents we send. Add a mimeType parameter when that changes.
    private static final String DOCUMENT_MIME_TYPE = "application/pdf";

    private final RestClient client;

    private final String phoneNumberId;

    /** Both the {@code enabled} flag and usable credentials — either missing means send nothing. */
    private final boolean enabled;

    @Autowired
    WhatsAppService(
            @Value("${app.whatsapp.enabled:false}") boolean enabled,
            @Value("${app.whatsapp.api-base-url:https://graph.facebook.com/v23.0}") String apiBaseUrl,
            @Value("${app.whatsapp.phone-number-id:}") String phoneNumberId,
            @Value("${app.whatsapp.access-token:}") String accessToken
    )
    {
        this(RestClient.builder().requestFactory(timeouts()), enabled, apiBaseUrl, phoneNumberId, accessToken);
    }

    /** Visible for tests, which bind a {@code MockRestServiceServer} to the builder. */
    WhatsAppService(
            RestClient.Builder builder,
            boolean enabled,
            String apiBaseUrl,
            String phoneNumberId,
            String accessToken
    )
    {
        this.phoneNumberId = phoneNumberId;
        this.enabled = enabled && !phoneNumberId.isBlank() && !accessToken.isBlank();
        this.client = builder
                .baseUrl(apiBaseUrl)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .build();
    }

    /**
     * A plain text message. Note that Meta only delivers free-form text inside the 24-hour
     * window opened by the recipient's last inbound message; a first contact needs an
     * approved template instead, which this service does not send yet.
     */
    public void sendText(String to, String body)
    {
        if (suppressed(to, "text message"))
        {
            return;
        }
        try
        {
            postMessage(message(to, "text", Map.of("preview_url", false, "body", body)));
        }
        catch (Exception e)
        {
            logFailure(to, "text message", e);
        }
    }

    /**
     * A PDF, uploaded to Meta first and then sent by the media id it hands back — so the
     * file never has to be publicly hosted. {@code caption} may be null or blank.
     */
    public void sendDocument(String to, byte[] document, String filename, String caption)
    {
        if (suppressed(to, filename))
        {
            return;
        }
        try
        {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", uploadMedia(document, filename));
            payload.put("filename", filename);
            if (caption != null && !caption.isBlank())
            {
                payload.put("caption", caption);
            }

            postMessage(message(to, "document", payload));
        }
        catch (Exception e)
        {
            logFailure(to, filename, e);
        }
    }

    /** Meta is a third party on the request thread — never wait on it indefinitely. */
    private static ClientHttpRequestFactory timeouts()
    {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(15));
        return factory;
    }

    /** Uploads the bytes and returns Meta's media id, which is valid for 30 days. */
    private String uploadMedia(byte[] document, String filename)
    {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("messaging_product", "whatsapp");
        form.add("type", DOCUMENT_MIME_TYPE);
        form.add("file", new ByteArrayResource(document)
        {
            @Override
            public String getFilename()
            {
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

    private void postMessage(Map<String, Object> payload)
    {
        Map<?, ?> response = client.post()
                .uri("/{phoneNumberId}/messages", phoneNumberId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(Map.class);

        log.debug("WhatsApp accepted message: {}", response);
    }

    private Map<String, Object> message(String to, String type, Object content)
    {
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
    private boolean suppressed(String to, String what)
    {
        if (enabled)
        {
            return false;
        }
        log.info("WhatsApp disabled (app.whatsapp.enabled / credentials), not sending \"{}\" to {}", what, to);
        return true;
    }

    private void logFailure(String to, String what, Exception e)
    {
        if (e instanceof RestClientResponseException response)
        {
            // Meta puts the actual reason (bad token, 24-hour window, unknown recipient)
            // in the body, not the status line.
            log.error("WhatsApp rejected \"{}\" for {}: {}", what, to, response.getResponseBodyAsString(), e);
            return;
        }
        log.error("WhatsApp send of \"{}\" to {} failed: {}", what, to, e.getMessage(), e);
    }
}
