package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;

import io.github.baeyung.hisaabkitaab.service.pdf.PdfRenderService;
import io.github.baeyung.hisaabkitaab.service.report.ReportRequest;
import io.github.baeyung.hisaabkitaab.service.report.ReportSendService;
import io.github.baeyung.hisaabkitaab.service.report.ReportTokenService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /api/stores/&#123;storeId&#125;/dev/reports — the floating gear's two buttons.
 *
 * <p>What is worth holding here is that this is a shortcut to the render and to nothing else:
 * it walks the scheduler's own road (same page URL, same signed token) so a preview cannot
 * drift from the document that actually goes out, and it stays inside {@code @CurrentStore}'s
 * boundary like every other store-scoped route — an owner's own books, and a 404 for anyone
 * else's.
 *
 * <p>{@link PdfRenderService} is mocked because it drives a headless Chrome no test has. That
 * mock is also the assertion: what this endpoint is really deciding is which URL that browser
 * is pointed at.
 */
@TestPropertySource(properties = {
        "app.reports.secret=test-secret",
        "app.reports.page-base-url=http://frontend"
})
class DevToolsApiTest extends ApiTest
{
    private static final String OWNER = "3494000001";

    private static final String OUTSIDER = "3494000002";

    private static final LocalDate TODAY = LocalDate.now();

    @MockitoBean
    private PdfRenderService pdfRenderService;

    @Autowired
    private ReportTokenService tokens;

    @BeforeEach
    void stubTheRenderer()
    {
        when(pdfRenderService.renderUrl(anyString())).thenReturn("%PDF-1.4".getBytes());
    }

    private String createParty(String contact, String storeId, String name) throws Exception
    {
        MvcResult result = mvc.perform(post(api(storeId, "/parties")).with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andReturn();

        return tree(result).get("id").asString();
    }

    /** The URL the renderer was handed, whatever it was. */
    private String pointedAt()
    {
        ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
        verify(pdfRenderService).renderUrl(url.capture());

        return url.getValue();
    }

    @Test
    void anOwnerRendersTheirOwnDay() throws Exception
    {
        signup(OWNER);
        String store = createStore(OWNER, "Kiryana Store");

        mvc.perform(get(api(store, "/dev/reports/daily")).param("date", TODAY.toString()).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", MediaType.APPLICATION_PDF_VALUE))
                // Inline, so the browser opens it in a tab rather than filling a downloads
                // folder — but still named, for whoever saves one out of the viewer.
                .andExpect(header().string("Content-Disposition",
                        "inline; filename=\"" + ReportSendService.dailyFilename(TODAY) + "\""));

        // The scheduler's own page, with a token this shop's report would answer to. Asserted
        // through the token service rather than by shape: a URL that merely looks right but
        // carries a subject the endpoint rebuilds differently renders a 401 page into somebody's
        // WhatsApp, which is exactly the failure a preview exists to catch early.
        String url = pointedAt();
        assertTrue(url.startsWith("http://frontend/report/daily/" + store + "/" + TODAY + "/"), url);
        assertTrue(tokens.isValid(ReportRequest.daily(store, TODAY).subject(),
                url.substring(url.lastIndexOf('/') + 1)), url);
    }

    @Test
    void aKhataStatementIsRenderedForOneParty() throws Exception
    {
        signup(OWNER);
        String store = createStore(OWNER, "Kiryana Store");
        String party = createParty(OWNER, store, "Ahmad");

        MvcResult result = mvc.perform(get(api(store, "/dev/reports/reminder/" + party))
                        .param("date", TODAY.toString()).with(as(OWNER)))
                .andExpect(status().isOk())
                .andReturn();

        assertEquals("%PDF-1.4", result.getResponse().getContentAsString());
        assertTrue(pointedAt().startsWith(
                "http://frontend/report/reminder/" + store + "/" + party + "/" + TODAY + "/"));
    }

    /** No date named: today, which is what the evening job would have sent. */
    @Test
    void withoutADateItRendersToday() throws Exception
    {
        signup(OWNER);
        String store = createStore(OWNER, "Kiryana Store");

        mvc.perform(get(api(store, "/dev/reports/daily")).with(as(OWNER)))
                .andExpect(status().isOk());

        assertTrue(pointedAt().contains("/report/daily/" + store + "/" + TODAY + "/"));
    }

    /**
     * The point of leaving this route on in production: it is inside the same tenant boundary
     * as everything else, so a flag anyone can set in their own localStorage buys them nothing.
     */
    @Test
    void anotherUsersShopStaysShut() throws Exception
    {
        signup(OWNER);
        signup(OUTSIDER);
        String store = createStore(OWNER, "Kiryana Store");

        mvc.perform(get(api(store, "/dev/reports/daily")).with(as(OUTSIDER)))
                .andExpect(status().isNotFound());

        mvc.perform(get(api(store, "/dev/reports/daily")))
                .andExpect(status().isUnauthorized());

        verify(pdfRenderService, never()).renderUrl(anyString());
    }

    /**
     * A party of another shop, named on this one's URL. Refused before the render — the page
     * would refuse it too, but thirty seconds later and as a blank PDF, which reads as the
     * renderer being broken rather than as the id being wrong.
     */
    @Test
    void aPartyFromAnotherShopIsRefusedBeforeRendering() throws Exception
    {
        signup(OWNER);
        signup(OUTSIDER);
        String mine = createStore(OWNER, "Kiryana Store");
        String theirs = createStore(OUTSIDER, "Cloth House");
        String theirParty = createParty(OUTSIDER, theirs, "Zubair");

        mvc.perform(get(api(mine, "/dev/reports/reminder/" + theirParty)).with(as(OWNER)))
                .andExpect(status().isNotFound());

        verify(pdfRenderService, never()).renderUrl(anyString());
    }
}
