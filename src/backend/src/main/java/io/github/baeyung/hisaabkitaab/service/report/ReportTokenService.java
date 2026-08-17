package io.github.baeyung.hisaabkitaab.service.report;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The credential the report pages are read with.
 *
 * <p>A scheduled report is rendered by driving a real browser at the app's own report route
 * (see {@code ReportScheduler}), and that browser has nobody signed in — there is no session to
 * borrow, because there was no request and no user. So the job mints one of these, hands it to
 * the renderer in the URL, and the page sends it straight back as a bearer token. What it
 * unlocks is one shop's report on one date and nothing else.
 *
 * <p>Signed rather than stored. A row in a table would need issuing, expiring and sweeping, and
 * would buy nothing: everything the token has to say is said by what it is signed over, and an
 * expiry inside the signature cannot be extended by whoever holds it. The subject is the whole
 * of the request the token is good for — kind, shop, date, and the party for a reminder — so a
 * token minted for one shop's report cannot be replayed against another's, or against the same
 * shop on a different day.
 *
 * <p>Five minutes, because the token's whole life is the round trip from this process to the
 * renderer and back. A leaked one is a URL that has already stopped working, and it never
 * leaves our own machines to begin with: backend → renderer → our nginx → backend.
 */
@Service
public class ReportTokenService
{
    private static final Logger log = LoggerFactory.getLogger(ReportTokenService.class);

    private static final Duration LIFETIME = Duration.ofMinutes(5);

    private static final String ALGORITHM = "HmacSHA256";

    private final SecretKeySpec key;

    ReportTokenService(@Value("${app.reports.secret:}") String secret)
    {
        this.key = new SecretKeySpec(
                (secret == null || secret.isBlank() ? randomSecret() : secret)
                        .getBytes(StandardCharsets.UTF_8),
                ALGORITHM);
    }

    /**
     * A key nobody configured. Fine, and better than a shipped default: the token never has to
     * outlive the process that minted it, so one made up at boot is as good as one from the
     * environment — and cannot be the same on every install, which a fallback constant would.
     *
     * <p>ponytail: this is what makes reports single-instance. Two backends would each mint
     * against their own key and reject the other's tokens. Set {@code app.reports.secret} —
     * the same value on every instance — the day a second one exists.
     */
    private static String randomSecret()
    {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        log.info("app.reports.secret is not set; using a key generated for this process. "
                + "Set it explicitly before running more than one backend.");
        return HexFormat.of().formatHex(bytes);
    }

    /**
     * A token good for {@code subject} for the next five minutes.
     *
     * @param subject exactly what is being asked for, as the endpoint will rebuild it — see
     *                {@link ReportKind#subject}. Anything not named here is not protected.
     */
    public String mint(String subject)
    {
        long expiry = Instant.now().plus(LIFETIME).getEpochSecond();

        return expiry + "." + sign(subject, expiry);
    }

    /**
     * Whether {@code token} was minted here for this exact subject and has not run out.
     *
     * <p>Every failure reads the same to the caller — a malformed token, one for another shop,
     * one whose signature does not check out, and one that has simply expired are all just
     * "no". The comparison is constant-time so that a caller cannot learn a signature by
     * measuring how long a wrong guess takes.
     */
    public boolean isValid(String subject, String token)
    {
        if (token == null)
        {
            return false;
        }

        int dot = token.indexOf('.');
        if (dot < 0)
        {
            return false;
        }

        long expiry;
        try
        {
            expiry = Long.parseLong(token.substring(0, dot));
        }
        catch (NumberFormatException e)
        {
            return false;
        }

        if (Instant.now().getEpochSecond() > expiry)
        {
            return false;
        }

        return MessageDigest.isEqual(
                sign(subject, expiry).getBytes(StandardCharsets.UTF_8),
                token.substring(dot + 1).getBytes(StandardCharsets.UTF_8));
    }

    private String sign(String subject, long expiry)
    {
        try
        {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(key);

            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    mac.doFinal((subject + "|" + expiry).getBytes(StandardCharsets.UTF_8)));
        }
        catch (Exception e)
        {
            // Neither the algorithm nor the key can go missing at runtime; if one has, no report
            // can be signed or checked and pretending otherwise would mean letting one through.
            throw new IllegalStateException("Could not sign a report token", e);
        }
    }
}
