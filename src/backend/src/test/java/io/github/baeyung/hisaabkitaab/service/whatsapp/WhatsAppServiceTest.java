package io.github.baeyung.hisaabkitaab.service.whatsapp;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.http.HttpMethod.POST;

/**
 * The {@code app.whatsapp.enabled} gate and the three payload shapes Meta expects. An
 * unexpected call raises an {@code AssertionError}, which the service's {@code catch
 * (Exception)} lets through — so a leaked send fails the test rather than being swallowed.
 */
class WhatsAppServiceTest
{
    private static final String MESSAGES_URL = "https://graph.test/v25.0/12345/messages";
    private static final String MEDIA_URL = "https://graph.test/v25.0/12345/media";

    private MockRestServiceServer server;

    private WhatsAppService service(boolean enabled, String phoneNumberId, String accessToken)
    {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        return new WhatsAppService(builder, enabled, "https://graph.test/v25.0", phoneNumberId, accessToken);
    }

    /**
     * A suppressed send reports false, not true: the caller is metering these against a paid
     * quota, and a message that never left must not be charged for.
     */
    @Test
    void sendsNothingWhenDisabled()
    {
        WhatsAppService whatsapp = service(false, "12345", "token");

        assertFalse(whatsapp.sendText("923001234567", "hello"));
        assertFalse(whatsapp.sendTemplate("923001234567", "hello_world", "en_US"));
        assertFalse(whatsapp.sendDocument("923001234567", "pdf".getBytes(), "statement.pdf", "your statement"));

        server.verify();
    }

    @Test
    void sendsNothingWhenCredentialsMissing()
    {
        WhatsAppService whatsapp = service(true, "", "");

        assertFalse(whatsapp.sendText("923001234567", "hello"));

        server.verify();
    }

    /** Meta refusing the message is reported rather than thrown — but it is reported. */
    @Test
    void reportsAMessageMetaRejected()
    {
        WhatsAppService whatsapp = service(true, "12345", "token");
        server.expect(requestTo(MESSAGES_URL))
                .andRespond(withBadRequest().body("{\"error\":{\"message\":\"outside window\"}}"));

        assertFalse(whatsapp.sendText("923001234567", "hello"));

        server.verify();
    }

    @Test
    void sendsText()
    {
        WhatsAppService whatsapp = service(true, "12345", "token");
        server.expect(requestTo(MESSAGES_URL))
                .andExpect(method(POST))
                .andExpect(jsonPath("$.messaging_product").value("whatsapp"))
                .andExpect(jsonPath("$.to").value("923001234567"))
                .andExpect(jsonPath("$.type").value("text"))
                .andExpect(jsonPath("$.text.body").value("hello"))
                .andRespond(withSuccess("{\"messages\":[{\"id\":\"wamid.1\"}]}", MediaType.APPLICATION_JSON));

        // A "+" and spacing survive in stored numbers; the service strips them.
        assertTrue(whatsapp.sendText("+92 300 1234567", "hello"));

        server.verify();
    }

    @Test
    void sendsTemplateWithOrderedBodyParameters()
    {
        WhatsAppService whatsapp = service(true, "12345", "token");
        server.expect(requestTo(MESSAGES_URL))
                .andExpect(method(POST))
                .andExpect(jsonPath("$.type").value("template"))
                .andExpect(jsonPath("$.template.name").value("jaspers_market_order_confirmation_v1"))
                .andExpect(jsonPath("$.template.language.code").value("en_US"))
                .andExpect(jsonPath("$.template.components[0].type").value("body"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].type").value("text"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].text").value("John Doe"))
                .andExpect(jsonPath("$.template.components[0].parameters[1].text").value("123456"))
                .andExpect(jsonPath("$.template.components[0].parameters[2].text").value("Aug 7, 2026"))
                .andRespond(withSuccess("{\"messages\":[{\"id\":\"wamid.4\"}]}", MediaType.APPLICATION_JSON));

        whatsapp.sendTemplate(
                "923488001949",
                "jaspers_market_order_confirmation_v1",
                "en_US",
                "John Doe", "123456", "Aug 7, 2026"
        );

        server.verify();
    }

    @Test
    void omitsComponentsForTemplateWithoutParameters()
    {
        WhatsAppService whatsapp = service(true, "12345", "token");
        server.expect(requestTo(MESSAGES_URL))
                .andExpect(jsonPath("$.template.name").value("hello_world"))
                .andExpect(jsonPath("$.template.components").doesNotExist())
                .andRespond(withSuccess("{\"messages\":[{\"id\":\"wamid.5\"}]}", MediaType.APPLICATION_JSON));

        whatsapp.sendTemplate("923488001949", "hello_world", "en_US");

        server.verify();
    }

    @Test
    void uploadsDocumentThenSendsItInTemplateHeader()
    {
        WhatsAppService whatsapp = service(true, "12345", "token");
        server.expect(requestTo(MEDIA_URL))
                .andExpect(method(POST))
                .andRespond(withSuccess("{\"id\":\"media-77\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(MESSAGES_URL))
                .andExpect(jsonPath("$.type").value("template"))
                .andExpect(jsonPath("$.template.name").value("invoice_v1"))
                // Header before body, in the order the approved template declares them.
                .andExpect(jsonPath("$.template.components[0].type").value("header"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].type").value("document"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].document.id").value("media-77"))
                .andExpect(jsonPath("$.template.components[0].parameters[0].document.filename").value("invoice.pdf"))
                .andExpect(jsonPath("$.template.components[1].type").value("body"))
                .andExpect(jsonPath("$.template.components[1].parameters[0].text").value("Ahmad"))
                .andRespond(withSuccess("{\"messages\":[{\"id\":\"wamid.6\"}]}", MediaType.APPLICATION_JSON));

        whatsapp.sendTemplateWithDocument(
                "923488001949",
                "invoice_v1",
                "en_US",
                "pdf-bytes".getBytes(),
                "invoice.pdf",
                "Ahmad"
        );

        server.verify();
    }

    @Test
    void uploadsDocumentThenSendsItByMediaId()
    {
        WhatsAppService whatsapp = service(true, "12345", "token");
        server.expect(requestTo(MEDIA_URL))
                .andExpect(method(POST))
                .andRespond(withSuccess("{\"id\":\"media-99\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(MESSAGES_URL))
                .andExpect(method(POST))
                .andExpect(jsonPath("$.type").value("document"))
                .andExpect(jsonPath("$.document.id").value("media-99"))
                .andExpect(jsonPath("$.document.filename").value("statement.pdf"))
                .andExpect(jsonPath("$.document.caption").value("your statement"))
                .andRespond(withSuccess("{\"messages\":[{\"id\":\"wamid.2\"}]}", MediaType.APPLICATION_JSON));

        assertTrue(whatsapp.sendDocument("923001234567", "pdf-bytes".getBytes(), "statement.pdf", "your statement"));

        server.verify();
    }

    @Test
    void omitsBlankCaption()
    {
        WhatsAppService whatsapp = service(true, "12345", "token");
        server.expect(requestTo(MEDIA_URL))
                .andRespond(withSuccess("{\"id\":\"media-99\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(MESSAGES_URL))
                .andExpect(jsonPath("$.document.caption").doesNotExist())
                .andRespond(withSuccess("{\"messages\":[{\"id\":\"wamid.3\"}]}", MediaType.APPLICATION_JSON));

        whatsapp.sendDocument("923001234567", "pdf-bytes".getBytes(), "statement.pdf", null);

        server.verify();
    }
}
