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
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Stamps every request with a short trace id and logs one line per request with method,
 * path, status and duration. The id goes into the MDC (rendered in every log line of that
 * request), onto the {@code X-Trace-Id} response header, and into the error body — so a
 * user reporting "it broke" hands over an id that points straight at the stack trace.
 *
 * <p>Runs outermost, ahead of the security filter chain, so anything that blows up in a
 * filter or a message converter — which never reaches {@code GlobalExceptionHandler} —
 * still gets logged with its stack trace here.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLogFilter extends OncePerRequestFilter
{
    public static final String TRACE_ID = "traceId";

    private static final Logger log = LoggerFactory.getLogger(RequestLogFilter.class);

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException
    {
        MDC.put(TRACE_ID, UUID.randomUUID().toString().substring(0, 8));
        response.setHeader("X-Trace-Id", MDC.get(TRACE_ID));

        long startedAt = System.nanoTime();
        try
        {
            chain.doFilter(request, response);
        }
        catch (Exception ex)
        {
            log.error("{} {} blew up outside the controller layer", request.getMethod(), uri(request), ex);
            throw ex;
        }
        finally
        {
            long ms = (System.nanoTime() - startedAt) / 1_000_000;
            int status = response.getStatus();

            if (status >= 500)
            {
                log.error("{} {} -> {} ({}ms)", request.getMethod(), uri(request), status, ms);
            }
            else if (status >= 400)
            {
                log.warn("{} {} -> {} ({}ms)", request.getMethod(), uri(request), status, ms);
            }
            else
            {
                log.info("{} {} -> {} ({}ms)", request.getMethod(), uri(request), status, ms);
            }

            MDC.clear();
        }
    }

    private String uri(HttpServletRequest request)
    {
        return request.getQueryString() == null
                ? request.getRequestURI()
                : request.getRequestURI() + "?" + request.getQueryString();
    }
}
