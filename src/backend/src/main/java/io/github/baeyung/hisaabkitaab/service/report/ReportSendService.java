package io.github.baeyung.hisaabkitaab.service.report;

import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendSource;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendStatus;
import io.github.baeyung.hisaabkitaab.service.pdf.PdfRenderService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.Addressee;
import io.github.baeyung.hisaabkitaab.service.whatsapp.DocumentShareService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.WhatsAppSendLogService;
import lombok.RequiredArgsConstructor;

/**
 * Renders one report and puts it on one phone.
 *
 * <p>The whole of what a scheduled send does differently from a shopkeeper pressing the button
 * is up front: there is no page to post, so this mints a token, hands the renderer the app's own
 * report URL, and lets the browser fetch what it needs. Past that it is the same road as
 * {@code WhatsAppShareController} — the same approved template through
 * {@link DocumentShareService}, the same {@code whatsapp_sends} row — because it is the same
 * act, and a report that arrived differently from a shared bill would be a second thing to
 * maintain.
 *
 * <p>Never throws. A job has nobody to report a failure to, and a renderer that is down at
 * 21:00 must not take the other shops' reports down with it — so every send answers whether it
 * went, leaves a row saying which, and lets the caller carry on to the next shop. The row is
 * the point: it is what a delivery-history screen will read, and for now it is the only place
 * a missed report is visible besides the log.
 */
@Service
@RequiredArgsConstructor
public class ReportSendService
{
    private static final Logger log = LoggerFactory.getLogger(ReportSendService.class);

    /**
     * English until the app has a shop-level language. The template exists in both, and
     * {@code DocumentShareService} picks by this — see {@code ShareRequest.locale}, which is the
     * per-send choice a browser makes and a job has no way of making.
     */
    private static final String LOCALE = "en";

    private final PdfRenderService pdfRenderService;

    private final ReportTokenService tokenService;

    private final DocumentShareService documentShareService;

    private final WhatsAppSendLogService sendLog;

    @Value("${app.reports.page-base-url:http://localhost:4200}")
    private String pageBaseUrl;

    /**
     * Render {@code request} and send it to {@code to}, recording the outcome against the shop.
     *
     * @param sender  the shop's owner. Nobody pressed anything, and the owner is the honest
     *                answer: they turned the job on and their plan carries it. {@code source}
     *                is what tells this apart from something they sent by hand.
     * @param action  the noun that reads inside the template's sentence — "Daily report".
     * @return whether it actually reached Meta.
     */
    public boolean send(Store store, User sender, Addressee to, ReportRequest request,
            String action, String filename, WhatsAppSendSource source)
    {
        WhatsAppSendStatus status = WhatsAppSendStatus.FAILED;
        try
        {
            byte[] pdf = pdfRenderService.renderUrl(
                    pageBaseUrl + request.pagePath(tokenService.mint(request.subject())));

            if (documentShareService.share(store, to, action, pdf, filename, LOCALE))
            {
                status = WhatsAppSendStatus.SENT;
            }
        }
        catch (RuntimeException e)
        {
            // The renderer being down, the report page failing to draw, Meta refusing the
            // upload. All the same from here: nothing arrived, the row says so, and the next
            // shop in the tick still gets its report.
            log.warn("Could not send the {} for store {}", source, store.getId(), e);
        }

        sendLog.record(store, sender, to, filename, status, source);

        return status == WhatsAppSendStatus.SENT;
    }

    /** Records a send that was never attempted — the recipient had opted out of this shop. */
    public void recordBlocked(Store store, User sender, Addressee to, String filename,
            WhatsAppSendSource source)
    {
        sendLog.record(store, sender, to, filename, WhatsAppSendStatus.BLOCKED, source);
    }

    /** {@code daily-report-2026-08-17.pdf} — dated, so a phone full of them stays readable. */
    public static String dailyFilename(LocalDate date)
    {
        return "daily-report-" + date + ".pdf";
    }

    /** {@code khata-statement-2026-08-31.pdf}, named for the reader rather than for the shop. */
    public static String reminderFilename(LocalDate date)
    {
        return "khata-statement-" + date + ".pdf";
    }
}
