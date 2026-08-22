# Reading the backend log

The log is written to `logs/hisaabkitaab.log` (override with `LOG_FILE`), rotated daily and
at 10 MB, kept 14 days.

Every line looks like this:

```
2026-08-23T02:58:44.677+05:00  INFO 7452 --- [hisaabkitaab] [http-nio-8080-exec-3] [f6cacf77] i.g.b.h.service.impl.PartyServiceImpl : deleting party 482ea7c2… "Ahmad Traders" …
                                                                                    ▲
                                                                                    trace id
```

The **trace id** is the whole trick. One request gets one id; every line it produces carries
it, it comes back to the browser on the `X-Trace-Id` response header, and it is in the
`traceId` field of any error body the SPA received. So:

```bash
grep 'f6cacf77' logs/hisaabkitaab.log
```

…is the complete story of one request, in order, and nothing else.

## The bracket

Every request is bracketed by two lines from `RequestLogFilter`:

```
--> DELETE /api/stores/314d5d2c…/parties/482ea7c2…
<-- DELETE /api/stores/314d5d2c…/parties/482ea7c2… 204 (67ms) [user=shopkeeper@example.com]
```

The arrival line is written **before any work starts**. That is what makes the two readings
distinguishable:

| What you see | What it means |
|---|---|
| `-->` and `<--` | The request ran and finished. The status and duration are on the `<--`. |
| `-->` with no `<--` | It arrived and is **still running** — or died with the process. Whatever ran last before it is where it is stuck. |
| Neither | It never reached the backend at all. Look at CORS, the proxy, or the network tab. |

`SLOW (over 1500ms)` on the `<--` line means it worked but took long enough that a user would
call it broken. Tune with `SLOW_REQUEST_MS`.

## What the levels carry

| Level | What is on it |
|---|---|
| `ERROR` | 5xx, with the stack trace. Something is broken. |
| `WARN` | 4xx, every refusal (plan limits, roles, locked accounts, wrong OTPs), and slow requests. Mostly *expected* — but each says exactly which rule fired. |
| `INFO` | Every write: the arrival/departure bracket, and what the service did in between. This is the running account of what changed. |
| `DEBUG` | Reads, CORS preflights, store resolution, and query sizes (how many rows a dashboard folded, how long a statement is). |

`io.github.baeyung.hisaabkitaab` ships at `DEBUG`. Set `LOG_LEVEL=INFO` in production to keep
only the writes and the refusals.

## Switches

| Variable | Default | What it does |
|---|---|---|
| `LOG_LEVEL` | `DEBUG` | This application's own logging. `INFO` drops reads and keeps every write. |
| `SLOW_REQUEST_MS` | `1500` | Above this, a successful request is still logged `WARN … SLOW`. |
| `SQL_LOG_LEVEL` | `INFO` | `DEBUG` prints every SQL statement. The answer to "which query is slow", and far too much noise for anything else. |
| `WEB_LOG_LEVEL` / `SECURITY_LOG_LEVEL` | `INFO` | Spring's own. `DEBUG` on the security one explains a 401/403 the app's own lines do not. |
| `LOG_FILE` | `logs/hisaabkitaab.log` | Where it goes. |

## Worked example: "I deleted a party and it froze"

```bash
grep -n 'deleting party' logs/hisaabkitaab.log      # find it
grep 'f6cacf77' logs/hisaabkitaab.log               # then the whole request
```

```
--> DELETE /api/stores/314d5d2c…/parties/482ea7c2…
resolved store 314d5d2c… "Rana Cloth" for user d6ae4599… (needs OWNER)
deleting party 482ea7c2… "Ahmad Traders" from store 314d5d2c…, cascading 412 transaction(s)
deleted party 482ea7c2… and its 412 transaction(s) in 9310ms
<-- DELETE /api/stores/314d5d2c…/parties/482ea7c2… 204 (9377ms) [user=…] SLOW (over 1500ms)
```

The cascade count is the answer: the delete was not stuck, it was removing 412 entries, and
its cost is unbounded in how much history the party has. The same shape covers deleting an
item or a whole shop.

If instead you see the `deleting party …` line and **no** `deleted party …` line, it is still
inside the cascade right now — check the database for a lock rather than the application.

## Where a silent answer gets explained

Several endpoints deliberately tell the caller nothing, so a stranger cannot use them to probe
for accounts. Those are the ones where the log is the *only* record of what happened:

- `POST /api/auth/verify`, `/verify-reset-otp`, `/reset-password` — answer a bare 404. The log
  says whether the code was missing, expired, burned by wrong guesses, or simply wrong.
- `POST /api/auth/resend-verification`, `/forgot-password` — always answer 204. The log says
  whether a mail actually went out, and if not, why it was suppressed.
- `POST /api/stores/{id}/whatsapp` — always answers 200 with a count. The log names who was
  dropped for opting out, and who the quota refused.

No code, token or password is ever written to the log — only the reason.
