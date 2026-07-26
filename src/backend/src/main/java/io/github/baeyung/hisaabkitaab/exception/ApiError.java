package io.github.baeyung.hisaabkitaab.exception;

import java.time.Instant;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class ApiError
{
    @Builder.Default
    private Instant timestamp = Instant.now();

    private int status;

    private String error;

    private String message;

    private String path;

    /** Matches the {@code X-Trace-Id} header and the MDC id on every log line of this request. */
    private String traceId;

    private Map<String, String> fieldErrors;
}