package io.github.baeyung.hisaabkitaab.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import io.github.baeyung.hisaabkitaab.service.report.ReportRequest;
import io.github.baeyung.hisaabkitaab.service.report.ReportSendService;
import lombok.RequiredArgsConstructor;

/**
 * Renders a scheduled report on demand, for whoever is debugging one.
 *
 * <p>The two reports are otherwise only produced by {@code ReportScheduler}, once a day and
 * once a month, which is a slow way to look at a layout change. This runs the same render for
 * the same shop and date and hands the PDF straight back — so a page that comes out wrong can
 * be looked at in the minute it was changed rather than the evening after.
 *
 * <p>It renders and nothing else. No WhatsApp message goes out, no row is written to
 * {@code whatsapp_sends}, no quota is spent, and none of the scheduler's gates — the plan's
 * allowance, the "was the shop even open today" check, the once-a-day guard — are consulted:
 * they decide whether a report is <em>sent</em>, and the point here is to see one that is not.
 * What it does share is {@link ReportSendService#render}, which is deliberately the same method
 * the evening send calls, so this cannot drift into previewing a document nobody receives.
 *
 * <p>The PDF also lands in {@code app.pdf.dump-dir} when that is set, like every other render —
 * {@code PdfRenderService} writes a copy of whatever passes through it, so with the compose
 * volume mounted these turn up under {@code ./pdf-dumps} next to the sent ones.
 *
 * <p>Owner-only and store-scoped, and safe to leave enabled in production on that basis: the
 * only thing reachable through it is a document the caller's own shop would have sent them,
 * built from books they can already read. The frontend's gear is behind a localStorage flag,
 * which is a convenience for not showing the button — it is not what makes this safe.
 *
 * <p>GET rather than POST: nothing is recorded, and a closed shop must still be able to look
 * at its own reports — {@code CurrentStoreArgumentResolver} asks {@code requireWritable} of
 * every write, which would refuse exactly the shops most in need of looking.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/dev/reports")
@RequiredArgsConstructor
public class DevToolsController
{
    private final ReportSendService reportSendService;

    private final PartyService partyService;

    /** The shop's day, as the owner would have received it that evening. */
    @GetMapping("/daily")
    public ResponseEntity<byte[]> daily(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @CurrentStore(StoreRole.OWNER) Store store)
    {
        LocalDate on = date != null ? date : LocalDate.now();

        return pdf(reportSendService.render(ReportRequest.daily(store.getId(), on)),
                ReportSendService.dailyFilename(on));
    }

    /**
     * One khata holder's statement, as the monthly chasing would have sent it to them.
     *
     * <p>The party is checked against this shop before anything is rendered. The report page
     * would refuse another shop's party anyway — {@code LedgerQueryService.getStatement} 404s
     * on one — but that failure arrives as a blank PDF thirty seconds later, which reads as
     * the renderer being broken rather than as the id being wrong.
     */
    @GetMapping("/reminder/{partyId}")
    public ResponseEntity<byte[]> reminder(
            @PathVariable String partyId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @CurrentStore(StoreRole.OWNER) Store store)
    {
        LocalDate on = date != null ? date : LocalDate.now();
        partyService.findByIdForStore(partyId, store.getId());

        return pdf(reportSendService.render(ReportRequest.reminder(store.getId(), partyId, on)),
                ReportSendService.reminderFilename(on));
    }

    /**
     * Inline, not an attachment: the browser opens it in a tab, which is the whole point —
     * a download folder filling up with dated PDFs is what {@code app.pdf.dump-dir} is for.
     * The name still rides along so that saving one from the viewer keeps it.
     */
    private static ResponseEntity<byte[]> pdf(byte[] bytes, String filename)
    {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(filename).build().toString())
                .body(bytes);
    }
}
