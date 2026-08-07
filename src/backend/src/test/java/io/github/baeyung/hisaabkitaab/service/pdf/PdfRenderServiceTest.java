package io.github.baeyung.hisaabkitaab.service.pdf;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * The renderer is a separate service, so what matters here is the contract with it: the page
 * goes over as JSON and the PDF comes back as bytes, and a renderer that is down surfaces as
 * a failure rather than as an empty document sent to a customer.
 */
class PdfRenderServiceTest
{
    private static final String RENDER_URL = "http://renderer:3000/render";

    private MockRestServiceServer server;

    private PdfRenderService service()
    {
        return service("");
    }

    private PdfRenderService service(String dumpDir)
    {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        return new PdfRenderService(builder, "http://renderer:3000", dumpDir);
    }

    @Test
    void postsThePageAndReturnsThePdfBytes()
    {
        PdfRenderService renderer = service();
        server.expect(requestTo(RENDER_URL))
                .andExpect(method(POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.html").value("<!doctype html><html>hi</html>"))
                .andRespond(withSuccess("%PDF-1.4".getBytes(), MediaType.APPLICATION_PDF));

        byte[] pdf = renderer.render("<!doctype html><html>hi</html>");

        assertThat(pdf).startsWith("%PDF".getBytes());
        server.verify();
    }

    @Test
    void surfacesARendererFailureInsteadOfSendingNothing()
    {
        PdfRenderService renderer = service();
        server.expect(requestTo(RENDER_URL)).andRespond(withServerError());

        assertThatThrownBy(() -> renderer.render("<html></html>"))
                .isInstanceOf(RestClientException.class);

        server.verify();
    }

    @Test
    void keepsACopyOnDiskWhenADumpDirIsConfigured(@TempDir Path dir) throws Exception
    {
        Path dumpDir = dir.resolve("pdfs");
        PdfRenderService renderer = service(dumpDir.toString());
        server.expect(requestTo(RENDER_URL))
                .andRespond(withSuccess("%PDF-1.4".getBytes(), MediaType.APPLICATION_PDF));

        renderer.render("<html></html>");

        try (Stream<Path> dumped = Files.list(dumpDir))
        {
            assertThat(dumped).singleElement()
                    .satisfies(f -> assertThat(f.getFileName().toString()).endsWith(".pdf"));
        }
    }
}
