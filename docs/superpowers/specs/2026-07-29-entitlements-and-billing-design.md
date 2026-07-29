# Entitlements and Billing — Design

Date: 2026-07-29
Status: approved, not yet implemented

## Purpose

Gate the application by subscription tier, and record every billing fact in an
audit trail that money questions can be answered from. The payment provider is
not yet chosen; this design deliberately stops at the seam where a provider
plugs in.

Three paid tiers exist as prices on the landing page — Standard PKR 3,000/mo,
Premium PKR 5,000/mo, Corporate PKR 10,000/mo — with a one-month trial and no
free tier. **Which capability belongs to which tier is not decided.** The
mechanism therefore treats the tier-to-capability mapping as configuration, not
as code.

## Decisions

| Question | Decision |
|---|---|
| What does a subscription attach to? | The `User` account. One subscription covers every `Store` that user owns. |
| What differs between tiers? | Undecided. The mechanism carries both boolean capabilities and numeric limits; the actual split lives in config. |
| What is blocked when lapsed? | Create and update of ledger data. Deletes, store settings, export/print, and profile/password stay open. |
| Grace period? | Yes, fixed, for both trial end and payment failure. |
| Source of truth | Append-only event log plus a one-row-per-user projection. |
| How does expiry take effect? | Dates are authoritative at request time. A daily job exists only to write history and send mail. |
| When does the trial start? | At email verification. |
| Trial tier | Premium. |
| Package boundary | Separate package inside the existing module, one public interface. |

## Architecture

Everything lives in `io.github.baeyung.hisaabkitaab.billing`.

The package exposes exactly one public interface. Entities, repositories, the
projection service, and the command types are package-private.

```java
public interface Entitlements {
    Access  access(String userId);              // tier, status, capabilities, dates
    boolean can(String userId, Capability c);
    void    require(String userId, Capability c);   // throws CapabilityRequiredException
    int     limit(String userId, String name);      // -1 = unlimited
}
```

Billing code never references `User` or `Store`. It keys off a `userId` string.
This is what makes a later extraction into a separate service a matter of
reimplementing `Entitlements` as an HTTP client, with no change anywhere else in
the application.

## Data model

### `billing_event` — append-only

Never updated, never deleted. This is the audit trail.

| column | type | notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | varchar, indexed | plain column, **no `@ManyToOne` to `User`** |
| `type` | enum | `TRIAL_STARTED, SUBSCRIBED, RENEWED, PAYMENT_FAILED, GRACE_STARTED, LAPSED, TIER_CHANGED, CANCELLED, ADMIN_OVERRIDE` |
| `tier` | enum, nullable | `STANDARD, PREMIUM, CORPORATE` |
| `period_start` | timestamp, nullable | |
| `period_end` | timestamp, nullable | |
| `actor` | enum | `SYSTEM, ADMIN, PROVIDER, USER` |
| `actor_ref` | varchar, nullable | admin email, or provider webhook id |
| `provider` | varchar, nullable | |
| `provider_ref` | varchar, nullable | **unique with `provider`** — webhook idempotency |
| `amount_minor` | bigint, nullable | paisa; never a floating-point type |
| `currency` | varchar(3), nullable | |
| `payload` | text, nullable | raw provider body, verbatim |
| `note` | varchar, nullable | required for `ADMIN_OVERRIDE` |
| `created_at` | timestamp | |

A partial unique index on `(provider, provider_ref)` where `provider_ref is not
null` makes duplicate webhook delivery a database-level impossibility rather
than an application-logic hope.

The DB-level foreign key on `user_id` stays for integrity while billing shares a
database. It is one `ALTER` to drop at extraction time. The absent *JPA
association* is the part that matters.

### `subscription` — projection

One row per user, rewritten in the same transaction as every event.

`user_id` (PK) · `tier` · `status` · `current_period_end` · `grace_until` ·
`last_event_id` · `version` (optimistic lock) · `updated_at`

`status` is one of `TRIALING, ACTIVE, GRACE, LAPSED, CANCELLED`.

### Access is computed, not read

```
effective(now):
  no subscription row                       -> LAPSED
  now <= current_period_end                 -> stored status (TRIALING | ACTIVE | CANCELLED)
  grace_until != null && now <= grace_until -> GRACE
  otherwise                                 -> LAPSED
```

Writes are permitted for `TRIALING`, `ACTIVE`, `GRACE`, and `CANCELLED`.
`CANCELLED` means the user has stopped the renewal but has already paid through
`current_period_end`, so they keep everything until that date and then fall to
`LAPSED` by the same rule. Only `LAPSED` is read-only.

Capabilities follow the effective status: `TRIALING`, `ACTIVE`, `CANCELLED`, and
`GRACE` all resolve `can()` against the tier's configured capability set — a
grace-period user does not lose features on top of being nagged. `LAPSED`
resolves every capability to false and every limit to `0`, regardless of the
tier last held.

Because dates decide, a dead scheduler cannot grant free access. The worst a
missed job does is skip a notification.

## Configuration

```yaml
billing:
  enforcement: false          # kill switch — ships dark
  trial-days: 30
  trial-tier: PREMIUM
  grace-days: 5
  tiers:
    STANDARD:  { capabilities: [],                                limits: { stores: 1 } }
    PREMIUM:   { capabilities: [WHATSAPP_SEND],                   limits: { stores: 3 } }
    CORPORATE: { capabilities: [WHATSAPP_SEND, EMAIL_STATEMENTS], limits: { stores: -1 } }
```

`Capability` is a Java enum, so an unknown name in YAML fails the application
boot. A typo cannot silently ungate a paid feature.

`limits` is a `Map<String,Integer>`; `-1` means unlimited. Limits are keyed by
string rather than by an enum, unlike capabilities: an unknown capability must
fail loudly because it would silently ungate a paid feature, whereas an unknown
limit name is only ever asked for by the code that defined it. Only `stores`
exists today.

The capability and limit values above are placeholders — the tier split is not
yet decided, and changing it is a config edit and a restart, not a code change.

The tier values in the config are illustrative. The only ones the implementation
depends on are the three tier names and the `Capability` enum constants that
exist at the time.

## Enforcement

Two mechanisms, because there are two shapes of problem.

### The write lock is a servlet filter

A `OncePerRequestFilter` registered after Spring Security's `AuthorizationFilter`,
so the principal is populated. It consults an ordered table; **first match wins,
and the default for any non-GET request is BLOCK**.

| # | rule | verdict |
|---|---|---|
| 1 | `* /api/auth/**` | allow |
| 2 | `GET, HEAD, OPTIONS` — any path | allow |
| 3 | `DELETE /api/**` | allow |
| 4 | `POST /api/transactions/bills/details` | allow |
| 5 | `PUT /api/stores/opening-cash` | **block** |
| 6 | `PUT /api/stores/{id}` | allow |
| — | any other non-GET | **block** |

Row 4 exists because `POST /api/transactions/bills/details` is a read that uses
POST to carry a request body. A method-based lock would break bill printing for
every lapsed user.

Rows 5 and 6 are why the table is ordered rather than a set. Spring's path
pattern `/api/stores/{id}` also matches `/api/stores/opening-cash`, so the
"store settings stay editable" carve-out would otherwise unlock an opening-balance
ledger write. Specific denies precede general allows.

The filter is fail-closed by construction: a write endpoint added later is
blocked when lapsed unless someone deliberately adds an allow row.

**The filter writes the 402 response body itself.** It must not throw — filters
run before `DispatcherServlet`, so `@RestControllerAdvice` never sees the
exception and the client would receive a container error page instead of JSON.

### Capability gates are explicit calls

Paid features call `entitlements.require(userId, WHATSAPP_SEND)` at the point the
feature runs. This is sparse, reads at the call site, and works for non-HTTP
callers such as a message-sending job.

`CapabilityRequiredException` is thrown from inside a controller, so it does
reach the advice chain. `GlobalExceptionHandler` declares
`@ExceptionHandler(Exception.class)`, which would claim it and return 500 — so
the billing advice must be annotated `@Order(Ordered.HIGHEST_PRECEDENCE)`.

### Error contract

Both paths answer **HTTP 402 Payment Required** with the existing `ApiError`
shape plus a nullable `billing` block: `currentTier`, `currentStatus`,
`requiredCapability` (null for the write lock), `periodEnd`, `graceUntil`.

### Frontend

A new `GET /api/billing/me` returns tier, status, capabilities, `periodEnd`, and
`graceUntil`. It is a separate endpoint rather than an extension of
`GET /api/auth/me`, which currently serialises the raw `User` entity and should
not grow.

Disabling buttons in the UI is a courtesy. The filter is the gate.

## Write path

Every state change goes through one method. Trial start, admin grant, webhook,
and the daily job all call the same door.

```java
@Transactional
Access apply(BillingCommand cmd)
// sealed: StartTrial | Activate | PaymentFailed | ChangeTier | Cancel | AdminOverride
```

1. If the command carries a `providerRef` and `(provider, provider_ref)` already
   exists, return current state and do nothing. The unique index is the backstop
   for the race between two concurrent retries.
2. Load the `subscription` row under its optimistic `version`, or create it.
3. Append the `billing_event`.
4. Recompute and save the projection.

All four steps in one transaction. Retry once on `OptimisticLockException`.

There is no code path that changes state without writing history. That is the
reason for the single entry point.

### Trial start

Hooks the point in `UserServiceImpl` where `setVerified(true)` is called.
`StartTrial` is a no-op when a subscription row already exists, so re-verifying
cannot mint a second trial.

### Grace is set once per period

`PaymentFailed` sets `grace_until = now + grace-days` **only when it is null for
the current period**. A provider retrying a dead card would otherwise roll the
window forward on every attempt and the account would never lock.

### Admin operations

`POST /api/admin/billing/{userId}`, guarded by `ROLE_ADMIN`.

Admin identity comes from a configured allowlist of email addresses, matched at
authentication time against verified accounts only. It is **not** a column on
`users`. A restored backup, or a single stray `UPDATE`, cannot mint an admin.

Every admin action requires a `note` and records `actor = ADMIN` with
`actor_ref` set to the admin's email.

### Payment provider

Nothing is built before the provider is chosen. The seam is `apply()`. Once the
provider's API is known, the webhook is one class: verify signature, map the
payload to a command, call `apply`.

No `PaymentProvider` interface is introduced now. A one-implementation
abstraction written before seeing the real API will be the wrong shape.

## Time

A `Clock` bean is injected everywhere dates are read, so expiry behaviour is
testable without sleeping.

A daily scheduled job — requiring `@EnableScheduling`, which the application does
not currently have — does three things, none of which grant access:

- Finds rows where `effective(now)` differs from the stored `status`, appends the
  `GRACE_STARTED` or `LAPSED` event, and fires the notification. Access was
  already correct before the job ran; this makes the history correct.
- Sends reminders at T-7, T-3, and T-1 before `period_end`, through the existing
  mail service and its suppression flag.
- Reconciles: re-derives the projection from the event log for recently-touched
  rows and logs loudly on mismatch. Without this, "event log plus projection" is
  a claim rather than a verified fact.

## Rollout

`billing.enforcement: false` is the default. With enforcement off the filter
passes every request and `require()` always allows. The feature therefore ships
to production dark, gets seeded and observed, and is switched on by flipping one
flag.

A one-time startup task grants a trial dated from the rollout day to every
verified user holding no subscription row. Existing accounts are trialed, not
grandfathered onto a paid tier.

## Deliberate omissions

- **No usage-counter table.** `limit()` returns a number; the only limit today
  (`stores`) is a `COUNT` query. Metered quotas such as WhatsApp sends per month
  get a counter when a metered feature exists.
- **No caching layer.** `access()` is a single indexed primary-key lookup per
  request. Add caching when a profiler asks for it.
- **No separate Maven module.** The boundary is the single public interface and
  the absence of any reference to `User` or `Store`.
- **No payment provider abstraction.** See above.

## Testing

| test | what it catches |
|---|---|
| Enumerate every `RequestMappingHandlerMapping` entry and assert its verdict | a write endpoint nobody classified |
| `PUT /api/stores/opening-cash` blocked while `PUT /api/stores/{id}` is allowed | the path-pattern collision, permanently |
| State machine driven by a fixed `Clock` | trial→active, trial→grace→lapsed, cancel retaining access to `period_end` |
| Same `providerRef` applied twice | one event, one state — webhook retries |
| Five consecutive `PaymentFailed` commands | the grace window does not move |
| Lapsed user with `enforcement: false` | the kill switch actually kills |
| Lapsed user: `DELETE` succeeds, `POST /api/parties` returns 402 | the carve-outs match the decision above |
| `can()` for a grace user vs. a lapsed user | grace keeps tier features; lapsed loses all of them |

## Acceptance criteria

- A verified user has a `TRIALING` subscription on the Premium tier, thirty days
  from verification, with a `TRIAL_STARTED` event recorded.
- A user past `current_period_end` with no grace cannot create or update ledger
  data, and receives 402 with tier and status in the body.
- The same user can still read every screen, delete records, edit store settings,
  and print bills.
- Replaying a provider webhook produces no second event and no state change.
- `billing.enforcement: false` restores full write access to a lapsed user
  without a code change.
- Every row in `subscription` is reproducible by folding that user's
  `billing_event` rows in `created_at` order.

## Open, by design

The tier-to-capability split. The payment provider integration. Both are
configuration and one class respectively, and neither blocks building the
mechanism.
