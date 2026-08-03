package io.github.baeyung.hisaabkitaab.api;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.baeyung.hisaabkitaab.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Error responses carry a trace id, Spring's own 4xx don't get reported as 500s, and — the
 * whole point — an unexpected failure reaches the log with its stack trace instead of
 * vanishing behind a generic 500.
 */
class ErrorHandlingApiTest extends ApiTest
{
    /** An endpoint that fails the way a real bug would: an unchecked exception nobody handles. */
    @TestConfiguration
    @RestController
    static class BoomConfig
    {
        @GetMapping("/api/test-boom")
        String boom()
        {
            throw new IllegalStateException("boom");
        }
    }

    @Test
    void unexpectedFailureIsLoggedAtErrorWithItsStackTrace() throws Exception
    {
        signup("3109000003");

        ch.qos.logback.classic.Logger handlerLog =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> captured = new ListAppender<>();
        captured.start();
        handlerLog.addAppender(captured);

        try
        {
            mvc.perform(get("/api/test-boom").with(as("3109000003")))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.traceId").isNotEmpty())
                    // The caller is told nothing useful; the detail is in the log.
                    .andExpect(jsonPath("$.message").value("An unexpected error occurred"));

            ILoggingEvent event = captured.list.getFirst();
            assertEquals(Level.ERROR, event.getLevel());
            assertNotNull(event.getThrowableProxy(), "500 must be logged with its stack trace");
            assertEquals(IllegalStateException.class.getName(), event.getThrowableProxy().getClassName());
        }
        finally
        {
            handlerLog.detachAppender(captured);
        }
    }

    @Test
    void errorBodyAndHeaderCarryTheSameTraceId() throws Exception
    {
        signup("3109000001");
        String store = createStore("3109000001", "Rana Cloth");

        mvc.perform(get(api(store, "/parties/00000000-0000-0000-0000-000000000000")).with(as("3109000001")))
                .andExpect(status().isNotFound())
                .andExpect(header().exists("X-Trace-Id"))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
    }

    @Test
    void unmappedRouteIsNotFoundNotServerError() throws Exception
    {
        signup("3109000002");

        mvc.perform(get("/api/no-such-endpoint").with(as("3109000002")))
                .andExpect(status().isNotFound());
    }

    @Test
    void validationFailureReportsFieldsWithTraceId() throws Exception
    {
        mvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"contactNumber\":\"\",\"email\":\"nope\",\"password\":\"x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.traceId").isNotEmpty())
                .andExpect(jsonPath("$.fieldErrors").isNotEmpty());
    }
}
