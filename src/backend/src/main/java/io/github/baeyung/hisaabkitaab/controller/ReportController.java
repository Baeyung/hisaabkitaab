package io.github.baeyung.hisaabkitaab.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.report.DailyReportResponse;
import io.github.baeyung.hisaabkitaab.dto.report.PartyReminderResponse;
import io.github.baeyung.hisaabkitaab.service.report.ReportQueryService;
import io.github.baeyung.hisaabkitaab.service.report.ReportRequest;
import io.github.baeyung.hisaabkitaab.service.report.ReportTokenService;
import lombok.RequiredArgsConstructor;

/**
 * What a report page reads to draw itself.
 *
 * <p>Public, and it has to be. A scheduled report is produced by pointing headless Chrome at
 * the app's own report route, and that browser has nobody signed in — there was no request and
 * no user, so there is no session to borrow and nothing to send an {@code Authorization: Basic}
 * header on behalf of. The same shape as {@code WhatsAppBlockController}, and for the same kind
 * of reason: a caller who cannot possibly hold an account, and a token that is the credential.
 *
 * <p>The difference from {@code /api/block} is what is at stake. That token unlocks a shop name
 * and four digits of a number the holder already owns; this one unlocks a shop's whole day, so
 * it is not merely unguessable but signed and short-lived — five minutes, minted by this process
 * for this exact report. See {@code ReportTokenService}.
 *
 * <p>Everything past the token check scopes on the store id alone, which is what every service
 * behind {@code CurrentStoreArgumentResolver} does too. The token is standing in for that
 * resolver, so it is signed over the store id: a token for one shop's report cannot be replayed
 * against another's, or against the same shop on a different day.
 */
@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController
{
    private static final String BEARER = "Bearer ";

    private final ReportQueryService reportQueryService;

    private final ReportTokenService tokenService;

    @GetMapping("/daily/{storeId}/{date}")
    public ResponseEntity<DailyReportResponse> daily(
            @PathVariable String storeId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization)
    {
        require(ReportRequest.daily(storeId, date), authorization);

        return ResponseEntity.ok(reportQueryService.daily(storeId, date));
    }

    @GetMapping("/reminder/{storeId}/{partyId}/{date}")
    public ResponseEntity<PartyReminderResponse> reminder(
            @PathVariable String storeId,
            @PathVariable String partyId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization)
    {
        require(ReportRequest.reminder(storeId, partyId, date), authorization);

        return ResponseEntity.ok(reportQueryService.reminder(storeId, partyId, date));
    }

    /**
     * The gate. Rebuilds the subject from this request's own path and asks whether the bearer
     * token was signed over exactly that — so a token is only ever good for the report it was
     * minted for, and a request that names a different shop fails however valid its token was
     * somewhere else.
     *
     * <p>401 rather than 404: unlike the store endpoints, there is nothing here to hide the
     * existence of. Whoever is asking has no account and is either the renderer with a good
     * token or nobody at all.
     */
    private void require(ReportRequest request, String authorization)
    {
        String token = authorization != null && authorization.startsWith(BEARER)
                ? authorization.substring(BEARER.length())
                : null;

        if (!tokenService.isValid(request.subject(), token))
        {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "This report link is not valid any more.");
        }
    }
}
