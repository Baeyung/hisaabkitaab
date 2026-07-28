# SUBSCRIPTION-001: AOP-Based Subscription Access Control

## Summary
Introduce a configuration-driven, AOP-based subscription enforcement layer that gates
feature access based on a user's current plan, derived from an event-sourced
`plan_events` audit table. The entire feature must be toggleable via config and fully
isolated in its own package.

---

## Background
Hisaab Kitaab currently has no mechanism to restrict features by subscription tier.
Payment integration (PayFast) is landing soon, and the backend needs a clean,
low-friction way to gate endpoints/services by plan without scattering `if` checks
across the codebase.

---

## Goals
- Derive current subscription status/tier from an append-only audit table.
- Enforce access via annotation + AOP, not inline checks.
- Make the whole feature switchable off via `application.yml` (useful for local dev,
  testing, and rollback safety).
- Keep it self-contained in its own package for maintainability and easy removal/extraction.

## Non-goals
- Payment gateway integration itself (PayFast webhook handling) — tracked separately.
- Frontend upgrade-prompt UI — tracked separately.

---

## Requirements

### 1. `plan_events` table (audit trail + current state)
```
plan_events
- id            (PK)
- user_id       (FK)
- plan_type     -- FREE, BASIC, PRO, etc.
- plan_status   -- ACTIVE, CANCELLED, EXPIRED, PAYMENT_FAILED, TRIAL
- event_reason  -- see enum below
- start_date
- end_date      (nullable)
- created_at
```

- A row with `end_date IS NULL` = currently open/active event.
- A row with `end_date` set = closed/historical event, ignored for current-state checks.
- Absence of any open row = user has no active subscription (defaults to FREE).

**`event_reason` enum — defined in full now, not just for the webhook path.**
Decided: plan changes won't only come from the payment webhook — admin comps, manual
refunds after support disputes, and QA overrides are expected. Adding these now costs
nothing; retrofitting an audit table's enum later means reinterpreting every historical
row's meaning.

```java
public enum EventReason {
    PAYMENT_SUCCESS,
    PAYMENT_FAILED,
    USER_CANCELLED,
    ADMIN_GRANTED,
    ADMIN_REVOKED,
    REFUNDED
}
```

**DB constraint (critical):** enforce at most one open row per user to prevent race
conditions (e.g. duplicate webhook deliveries) from producing ambiguous state.

```sql
CREATE UNIQUE INDEX one_open_plan_event_per_user
  ON plan_events (user_id) WHERE end_date IS NULL;
```

### 2. Config-driven enablement
Subscription checks must be fully controlled by `application.yml`:

```yaml
subscription:
  enforcement:
    enabled: true   # when false, @RequiresPlan is a no-op — all requests pass through
```

- When `enabled: false`, the aspect must short-circuit before touching DB/cache at all.
- Should be read via `@ConfigurationProperties` (not scattered `@Value` calls) so it's
  testable and centralized.
- **Decided:** config-off means true no-op — grants everything, doesn't downgrade to
  FREE. "Enforcement off" should behave as if subscriptions don't exist at all, which is
  what local dev/testing needs. A FREE-only fallback would require the enforcement
  logic to still run with a different rule, defeating the point of the flag.

### 3. Dedicated package structure
All subscription-related code lives under its own package, isolated from the rest of
the domain:

```
io.github.baeyung.hisaabkitaab.subscription
├── annotation/
│   └── RequiresPlan.java
├── aspect/
│   └── SubscriptionAspect.java
├── cache/
│   ├── PlanStatusCache.java
│   └── InMemoryPlanStatusCache.java
├── config/
│   └── SubscriptionProperties.java
├── entity/
│   └── PlanEvent.java
├── enums/
│   ├── PlanType.java
│   ├── PlanStatus.java
│   └── EventReason.java
├── exception/
│   └── SubscriptionRequiredException.java
├── repository/
│   └── PlanEventRepository.java
└── service/
    └── SubscriptionStatusService.java
```

Nothing outside this package should know about `plan_events` internals — other modules
only interact via `@RequiresPlan` and `SubscriptionStatusService` (if needed directly).

### 4. Annotation + Aspect

**`PlanType` — hierarchical, not a flat set.**
Decided: `@RequiresPlan` uses "minimum tier" semantics rather than strict exact-match.
Exact-match would mean every new PRO feature requires remembering to list `{BASIC, PRO}`
wherever BASIC-and-above should still pass — easy to get wrong. An ordinal level makes
"BASIC or higher" the default behavior of a single value.

```java
public enum PlanType {
    FREE(0),
    BASIC(1),
    PRO(2);

    private final int level;

    PlanType(int level) {
        this.level = level;
    }

    public int getLevel() {
        return level;
    }
}
```

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface RequiresPlan {
    PlanType value(); // minimum required tier — e.g. @RequiresPlan(BASIC) also allows PRO
}
```

```java
@Aspect
@Component
@RequiredArgsConstructor
public class SubscriptionAspect {

    private final SubscriptionProperties properties;
    private final SubscriptionStatusService subscriptionStatusService;

    @Before("@annotation(requiresPlan)")
    public void checkPlan(RequiresPlan requiresPlan) {
        if (!properties.isEnabled()) {
            return; // config off — no-op
        }

        Long userId = SecurityContextUtil.currentUserId();
        PlanType currentPlan = subscriptionStatusService.getActivePlan(userId);

        if (currentPlan.getLevel() < requiresPlan.value().getLevel()) {
            throw new SubscriptionRequiredException(requiresPlan.value());
        }
    }
}
```

`SubscriptionRequiredException` → mapped via `@ControllerAdvice` to a 402/403 response
with a body the Angular frontend can use to trigger an upgrade prompt.

### 5. Caching (in-memory now, swappable later)
No new infra for this iteration — implement an in-memory cache, but hide it behind an
interface so a later move to Redis (or Caffeine, etc.) is a drop-in `@Component` swap
with zero changes to `SubscriptionStatusService` or the aspect.

**Interface — this is the contract the rest of the module codes against:**
```java
public interface PlanStatusCache {
    Optional<PlanType> get(Long userId);
    void put(Long userId, PlanType planType);
    void evict(Long userId);
}
```

**In-memory implementation** — `ConcurrentHashMap` with a stored expiry timestamp per
entry, lazy-expired on read (no background thread needed for this scale):

```java
@Component
public class InMemoryPlanStatusCache implements PlanStatusCache {

    private static final Duration TTL = Duration.ofMinutes(15);

    private record CacheEntry(PlanType planType, Instant expiresAt) {}

    private final Map<Long, CacheEntry> store = new ConcurrentHashMap<>();

    @Override
    public Optional<PlanType> get(Long userId) {
        CacheEntry entry = store.get(userId);
        if (entry == null) return Optional.empty();

        if (Instant.now().isAfter(entry.expiresAt())) {
            store.remove(userId);
            return Optional.empty();
        }
        return Optional.of(entry.planType());
    }

    @Override
    public void put(Long userId, PlanType planType) {
        store.put(userId, new CacheEntry(planType, Instant.now().plus(TTL)));
    }

    @Override
    public void evict(Long userId) {
        store.remove(userId);
    }
}
```

**Service depends on the interface only:**
```java
@Service
@RequiredArgsConstructor
public class SubscriptionStatusService {

    private final PlanEventRepository repo;
    private final PlanStatusCache cache;

    public PlanType getActivePlan(Long userId) {
        return cache.get(userId).orElseGet(() -> {
            PlanType plan = repo.findOpenEventForUser(userId)
                .map(PlanEvent::getPlanType)
                .orElse(PlanType.FREE);
            cache.put(userId, plan);
            return plan;
        });
    }

    public void invalidate(Long userId) {
        cache.evict(userId);
    }
}
```

- `invalidate()` must be called from wherever `plan_events` rows get written (webhook
  handler, cancellation flow, admin override) — don't rely on TTL alone, or a user who
  just paid could stay locked out for up to 15 minutes.
- Since this is a single-instance home VPS deployment (not a multi-node cluster), an
  in-memory `ConcurrentHashMap` is correct as-is — no cache-consistency-across-instances
  problem to solve yet. If you ever horizontally scale, that's the trigger to swap in a
  Redis-backed `PlanStatusCache` implementation — the interface means that's a
  one-file change.

---

## Decisions
- **Event sources:** not webhook-only — admin/manual actions (comps, refunds, QA
  overrides) are in scope from day one, hence the full `EventReason` enum above.
- **Tier semantics:** hierarchical/minimum-tier via ordinal `PlanType.level`, not
  strict exact-match. `@RequiresPlan(BASIC)` passes for BASIC and PRO.
- **Config-off behavior:** true no-op — grants everything, zero DB/cache calls.

---

## Acceptance Criteria
- [ ] `plan_events` table created with unique partial index on open rows.
- [ ] `EventReason` enum includes both payment and admin/manual values.
- [ ] `subscription.enforcement.enabled` toggles all enforcement with zero DB/cache
  calls when off.
- [ ] All subscription code isolated under `io.github.baeyung.hisaabkitaab.subscription` package.
- [ ] `PlanType` implements ordinal `level` and `@RequiresPlan` enforces minimum-tier,
  not exact-match.
- [ ] `@RequiresPlan` annotation gates at least one real endpoint as a proof of concept.
- [ ] `PlanStatusCache` interface + `InMemoryPlanStatusCache` in place, with explicit
  `invalidate()` call wired into every `plan_events` write path.
- [ ] Unit tests: aspect behavior with config on/off, tier hierarchy (BASIC passes for
  PRO user), cache hit/miss, multiple plan types.