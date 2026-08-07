package io.github.baeyung.hisaabkitaab.service.whatsapp;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.POST;

/**
 * The {@code app.whatsapp.enabled} gate and the two payload shapes Meta expects. An
 * unexpected call raises an {@code AssertionError}, which the service's {@code catch
 * (Exception)} lets through — so a leaked send fails the test rather than being swallowed.
 */
class WhatsAppServiceTest
{
    private static final String MESSAGES_URL = "https://graph.test/v23.0/12345/messages";
    private static final String MEDIA_URL = "https://graph.test/v23.0/12345/media";

    private MockRestServiceServer server;

    private WhatsAppService service(boolean enabled, String phoneNumberId, String accessToken)
    {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        return new WhatsAppService(builder, enabled, "https://graph.test/v23.0", phoneNumberId, accessToken);
    }

    @Test
    void sendsNothingWhenDisabled()
    {
        WhatsAppService whatsapp = service(false, "12345", "token");

        whatsapp.sendText("923001234567", "hello");
        whatsapp.sendDocument("923001234567", "pdf".getBytes(), "statement.pdf", "your statement");

        server.verify();
    }

    @Test
    void sendsNothingWhenCredentialsMissing()
    {
        WhatsAppService whatsapp = service(true, "", "");

        whatsapp.sendText("923001234567", "hello");

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
        whatsapp.sendText("+92 300 1234567", "hello");

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

        whatsapp.sendDocument("923001234567", "pdf-bytes".getBytes(), "statement.pdf", "your statement");

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
