package io.github.baeyung.hisaabkitaab.exception;

import io.github.baeyung.hisaabkitaab.config.RequestLogFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;

import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns exceptions into the JSON error body the SPA expects — and, just as importantly,
 * writes them to the log. Nothing here is silent: 5xx is logged at ERROR with the full
 * stack trace, 4xx at WARN as a one-liner (a client mistake is not an incident, but it
 * still has to be visible). Every line carries the request's trace id, which is also
 * returned to the caller in {@code ApiError.traceId} and the {@code X-Trace-Id} header.
 *
 * <p>Extends {@link ResponseEntityExceptionHandler} so Spring's own exceptions — 404 for
 * an unmapped route, 405, 415, unreadable body — keep their real status instead of falling
 * into {@link #handleGeneric} and being reported as 500s, which would bury the real ones.
 *
 * <p>The response body stays deliberately vague on 500s: the detail belongs in the log,
 * not in something a caller can read.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler
{
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Object> handleNotFound(ResourceNotFoundException ex, HttpServletRequest request)
    {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request, null, ex);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Object> handleIllegalArgument(IllegalArgumentException ex, HttpServletRequest request)
    {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request, null, ex);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Object> handleDuplicate(DataIntegrityViolationException ex, HttpServletRequest request)
    {
        // The constraint that actually fired is only in the JDBC root cause — without it
        // every conflict looks like a duplicate signup, which is usually a lie.
        log.warn("constraint violation: {}", rootCause(ex).toString());
        return build(HttpStatus.CONFLICT, "Account already exists", request, null, ex);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleGeneric(Exception ex, HttpServletRequest request)
    {
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred", request, null, ex);
    }

    /** Bean-validation failures, reported per field so the form can highlight them. */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request)
    {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(
                fieldError -> fieldErrors.put(fieldError.getField(), fieldError.getDefaultMessage()));

        return build(HttpStatus.BAD_REQUEST, "Validation failed", servletRequest(request), fieldErrors, ex);
    }

    /** Every other exception Spring MVC handles itself lands here to be logged and reshaped. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, @Nullable Object body,
            HttpHeaders headers, HttpStatusCode statusCode, WebRequest request)
    {
        HttpStatus status = HttpStatus.valueOf(statusCode.value());
        String message = ex instanceof ErrorResponse errorResponse && errorResponse.getBody().getDetail() != null
                ? errorResponse.getBody().getDetail()
                : status.getReasonPhrase();

        return build(status, message, servletRequest(request), null, ex);
    }

    private ResponseEntity<Object> build(HttpStatus status, String message, HttpServletRequest request,
            Map<String, String> fieldErrors, Exception ex)
    {
        String user = request.getUserPrincipal() == null ? "anonymous" : request.getUserPrincipal().getName();

        if (status.is5xxServerError())
        {
            log.error("{} {} [user={}] -> {} {}", request.getMethod(), request.getRequestURI(), user,
                    status.value(), status.getReasonPhrase(), ex);
        }
        else
        {
            // One line, no stack: a 400 is the caller's problem, not a fire. The exception's
            // own toString() is useless here (a validation failure prints a full page of
            // binding results), so log the type plus the field errors that caused it.
            log.warn("{} {} [user={}] -> {} {} [{}]{}", request.getMethod(), request.getRequestURI(), user,
                    status.value(), message, ex.getClass().getSimpleName(),
                    fieldErrors == null ? "" : " " + fieldErrors);
            log.trace("4xx detail", ex);
        }

        ApiError apiError = ApiError.builder()
                .status(status.value())
                .error(status.getReasonPhrase())
                .message(message)
                .path(request.getRequestURI())
                .traceId(MDC.get(RequestLogFilter.TRACE_ID))
                .fieldErrors(fieldErrors)
                .build();

        return ResponseEntity.status(status).body(apiError);
    }

    private HttpServletRequest servletRequest(WebRequest request)
    {
        return ((ServletWebRequest) request).getRequest();
    }

    private Throwable rootCause(Throwable ex)
    {
        Throwable cause = ex;
        while (cause.getCause() != null && cause.getCause() != cause)
        {
            cause = cause.getCause();
        }
        return cause;
    }
}
