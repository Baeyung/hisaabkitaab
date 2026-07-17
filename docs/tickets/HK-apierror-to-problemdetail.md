# HK-ERRORS-01 — Replace hand-rolled `ApiError` with Spring's `ProblemDetail`

**Status:** Open · **Priority:** Low · **Area:** Backend / API contract · **Size:** ~102 lines → ~40

## Context

`exception/ApiError.java` is a Lombok-built DTO carrying `timestamp`, `status`, `error`,
`message`, `path`, `fieldErrors`. `exception/GlobalExceptionHandler.java` is a
`@RestControllerAdvice` with six handlers, all funnelling through a private `build(...)`.

Spring Boot already ships this. `ProblemDetail` (RFC 7807, since Spring 6) covers the same
ground with `status`, `title`, `detail`, `instance`, plus arbitrary properties for the
field-error map. `ResponseEntityExceptionHandler` already handles
`MethodArgumentNotValidException` and `HttpMessageNotReadableException` — two of the six
handlers re-implement what the base class does.

## Target design

Extend `ResponseEntityExceptionHandler` and keep only the handlers that say something
Spring doesn't:

- `ResourceNotFoundException` → 404 (ours)
- `DataIntegrityViolationException` → 409 "Account already exists" (ours)
- `IllegalArgumentException` → 400 (ours)
- validation / malformed-body → **delete**, the base class covers them
- catch-all `Exception` → 500 (keep; consider whether it belongs — see below)

`ApiError` and the `build`/`path` helpers go away. `path` in particular is doing
`request.getDescription(false).replace("uri=", "")` — string-scraping a description field
to recover a URI that `ProblemDetail.instance` carries properly.

## ⚠️ This is an API contract change — check the frontend first

The JSON shape changes: `{status, error, message, path, fieldErrors}` becomes
`{type, title, status, detail, instance, ...}`, served as
`application/problem+json`.

As of today the frontend does **not** read the body — every call site is a bare
`catch { ... }` mapping to a generic `error.generic` toast (`goods-entry.ts`,
`expense.ts`, `party-cash-entry.ts`, `settings/*`). So this is currently free.

That will stop being true the moment a screen wants to surface a real server message
(the duplicate-account 409 on signup is the obvious first candidate). **Land this before
any screen starts parsing the error body, or don't land it at all** — the cost is only low
while nothing depends on the shape. If field-level validation display is on the near
roadmap, do that work *on top of* `ProblemDetail` rather than migrating afterwards.

## Also worth deciding

The catch-all `@ExceptionHandler(Exception.class)` → 500 swallows the stack trace with no
logging — `handleGeneric` builds a response and never logs `ex`. Whatever happens to the
DTO, that handler should log at ERROR before returning, or genuine server faults stay
invisible. (Strictly an observability point, not an over-engineering one — flagged here
because this ticket is where the file gets touched.)

## Done when

- `exception/ApiError.java` is gone.
- `GlobalExceptionHandler extends ResponseEntityExceptionHandler` and holds only the
  handlers with project-specific meaning.
- 404 / 409 / 400 / 500 responses still carry a human-readable message; validation errors
  still name the offending fields.
- Frontend error toasts behave unchanged (they should — nothing reads the body yet).
