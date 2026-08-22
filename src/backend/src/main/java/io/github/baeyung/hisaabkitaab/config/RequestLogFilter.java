package io.github.baeyung.hisaabkitaab.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Stamps every request with a short trace id and writes two lines around it: one when it
 * arrives and one when it leaves. The id goes into the MDC (rendered in every log line of
 * that request), onto the {@code X-Trace-Id} response header, and into the error body — so
 * a user reporting "it broke" hands over an id that points straight at the stack trace.
 *
 * <p>The arrival line is the point of this class. A single line written on the way out can
 * only ever be written by a request that <em>finished</em>: while one is still running —
 * stuck on a lock, grinding through a cascade, waiting on a call that never returns — the
 * log says nothing at all, and the operator is left unable to tell a slow request from one
 * that never landed. So the arrival is recorded before any work starts, and the pair is
 * read as a bracket: an {@code -->} with no matching {@code <--} is a request still in
 * flight (or one that took the process down with it).
 *
 * <p>Runs outermost, ahead of the security filter chain, so anything that blows up in a
 * filter or a message converter — which never reaches {@code GlobalExceptionHandler} —
 * still gets logged with its stack trace here. The caller's identity is not known this far
 * out; {@link PrincipalMdcFilter}, which runs inside the security chain, puts it in the MDC
 * in time for the departure line to carry it.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLogFilter extends OncePerRequestFilter
{
    public static final String TRACE_ID = "traceId";

    private static final Logger log = LoggerFactory.getLogger(RequestLogFilter.class);

    /**
     * Past this, a request that succeeded is still worth a WARN: "it worked but it hung"
     * is the complaint that has no other trace, and it is the one that needs a threshold
     * rather than an error to be found.
     */
    private final long slowRequestMs;

    RequestLogFilter(@Value("${app.logging.slow-request-ms:1500}") long slowRequestMs)
    {
        this.slowRequestMs = slowRequestMs;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException
    {
        MDC.put(TRACE_ID, UUID.randomUUID().toString().substring(0, 8));
        response.setHeader("X-Trace-Id", MDC.get(TRACE_ID));

        String method = request.getMethod();
        String uri = uri(request);

        // Reads and CORS preflights are logged a level down: at a shopkeeper's request rate
        // they are the bulk of the traffic and none of them change anything, so keeping them
        // out of INFO is what leaves the writes legible. LOG_LEVEL=DEBUG brings them back.
        if (changesData(method))
        {
            log.info("--> {} {}", method, uri);
        }
        else
        {
            log.debug("--> {} {}", method, uri);
        }

        long startedAt = System.nanoTime();
        try
        {
            chain.doFilter(request, response);
        }
        catch (Exception ex)
        {
            log.error("{} {} blew up outside the controller layer", method, uri, ex);
            throw ex;
        }
        finally
        {
            long ms = (System.nanoTime() - startedAt) / 1_000_000;
            int status = response.getStatus();
            // Absent when the request never reached PrincipalMdcFilter at all — refused by
            // CORS, or thrown out of a filter ahead of the security chain.
            String who = MDC.get(PrincipalMdcFilter.USER);
            if (who == null)
            {
                who = PrincipalMdcFilter.ANONYMOUS;
            }

            if (status >= 500)
            {
                log.error("<-- {} {} {} ({}ms) [user={}]", method, uri, status, ms, who);
            }
            else if (status >= 400)
            {
                log.warn("<-- {} {} {} ({}ms) [user={}]", method, uri, status, ms, who);
            }
            else if (ms >= slowRequestMs)
            {
                log.warn("<-- {} {} {} ({}ms) [user={}] SLOW (over {}ms)",
                        method, uri, status, ms, who, slowRequestMs);
            }
            else if (changesData(method))
            {
                log.info("<-- {} {} {} ({}ms) [user={}]", method, uri, status, ms, who);
            }
            else
            {
                log.debug("<-- {} {} {} ({}ms) [user={}]", method, uri, status, ms, who);
            }

            MDC.clear();
        }
    }

    /** Whether this request can leave the database different from how it found it. */
    private static boolean changesData(String method)
    {
        return !"GET".equals(method) && !"HEAD".equals(method) && !"OPTIONS".equals(method);
    }

    private String uri(HttpServletRequest request)
    {
        return request.getQueryString() == null
                ? request.getRequestURI()
                : request.getRequestURI() + "?" + request.getQueryString();
    }
}
