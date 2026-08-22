package io.github.baeyung.hisaabkitaab.service.pdf;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Renders a printable page to PDF through the {@code renderer} service — headless Chrome.
 * <p>
 * The browser is what makes this worth a separate service: it applies the frontend's own
 * {@code @media print} rules and shapes Noto Nastaliq correctly, so the PDF is the printout
 * rather than a picture of it, with text that stays sharp at any zoom. Rebuilding either
 * here would mean a second copy of the layout that drifts from the real one.
 */
@Service
public class PdfRenderService
{
    private static final Logger log = LoggerFactory.getLogger(PdfRenderService.class);

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS");

    private final RestClient client;

    /**
     * Blank unless someone is debugging; see {@code app.pdf.dump-dir}.
     */
    private final String dumpDir;

    @Autowired
    PdfRenderService(@Value("${app.pdf.renderer-url:http://localhost:3000}") String rendererUrl,
            @Value("${app.pdf.dump-dir:}") String dumpDir)
    {
        this(RestClient.builder().requestFactory(timeouts()), rendererUrl, dumpDir);
    }

    /**
     * Visible for tests, which bind a {@code MockRestServiceServer} to the builder.
     */
    PdfRenderService(RestClient.Builder builder, String rendererUrl, String dumpDir)
    {
        this.client = builder.baseUrl(rendererUrl).build();
        this.dumpDir = dumpDir;
    }

    /**
     * @param html a self-contained page — styles inlined, no scripts, since the renderer
     *             resolves nothing relative to the app.
     * @return the PDF bytes.
     * @throws org.springframework.web.client.RestClientException if the renderer is down or
     *                                                            fails to render.
     */
    public byte[] render(String html)
    {
        return post(Map.of("html", html));
    }

    /**
     * The same printout, fetched rather than handed over: the renderer opens {@code url} in its
     * browser and prints what loads.
     *
     * <p>For the scheduled reports, which have no screen to copy. Nobody is signed in when they
     * run, so there is no rendered page to post — but the renderer is a real browser, and the
     * app is perfectly capable of drawing itself if something opens it. The page authorises
     * its own API calls with the token in the URL; see {@code ReportTokenService}.
     *
     * @param url an absolute address the renderer can reach, which is not the same as one a
     *            customer could — in Docker it is the frontend container by service name.
     */
    public byte[] renderUrl(String url)
    {
        return post(Map.of("url", url));
    }

    private byte[] post(Map<String, String> request)
    {
        // The slowest thing the application does, out of process, and behind a sixty-second
        // read timeout — so the whole minute a stuck renderer costs is a minute in which
        // nothing else would say a word. The line before the call is what tells "Chrome is
        // still going" from "the request never got here"; the one after gives the size, which
        // is the only cheap check that what came back is a document and not an error page.
        String target = request.containsKey("url") ? request.get("url") : "posted html";
        log.info("rendering PDF via the renderer service ({})", target);

        long startedAt = System.nanoTime();
        try
        {
            byte[] pdf = client.post()
                    .uri("/render")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(byte[].class);

            log.info("rendered {} bytes of PDF in {}ms ({})",
                    pdf == null ? 0 : pdf.length, (System.nanoTime() - startedAt) / 1_000_000, target);

            dump(pdf);
            return pdf;
        }
        catch (RuntimeException ex)
        {
            // Rethrown untouched — the callers already decide what a failed render means. This
            // only makes sure the renderer is named as the thing that failed, because from a
            // stack trace alone it reads as an ordinary HTTP error from somewhere unspecified.
            log.error("renderer failed after {}ms ({}): {}",
                    (System.nanoTime() - startedAt) / 1_000_000, target, ex.toString());
            throw ex;
        }
    }

    /**
     * Keeps a copy of what was rendered when {@code app.pdf.dump-dir} is set. A failure to
     * write is never worth failing the send over, so it is only logged.
     */
    private void dump(byte[] pdf)
    {
        if (dumpDir == null || dumpDir.isBlank() || pdf == null)
        {
            return;
        }
        try
        {
            Path dir = Files.createDirectories(Path.of(dumpDir));
            Path file = dir.resolve(LocalDateTime.now().format(STAMP) + ".pdf");
            Files.write(file, pdf);
            log.info("Wrote rendered PDF to {}", file.toAbsolutePath());
        }
        catch (IOException | RuntimeException e)
        {
            log.warn("Could not write rendered PDF to {}", dumpDir, e);
        }
    }

    /**
     * Chrome needs a moment to lay out a long khata and fetch its webfonts, but a request
     * thread must never be held indefinitely.
     */
    private static ClientHttpRequestFactory timeouts()
    {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(60));
        return factory;
    }
}
