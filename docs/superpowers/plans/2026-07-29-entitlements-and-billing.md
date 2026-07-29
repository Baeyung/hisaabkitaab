# Entitlements and Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate write access and paid features by subscription tier, backed by an append-only billing audit trail, with no payment provider integrated yet.

**Architecture:** A self-contained `billing` package exposing two public interfaces — `Entitlements` (read) and `Subscriptions` (write). All state changes append an immutable `billing_events` row, then replay that user's events into a `subscriptions` projection row. Access is computed from dates at request time, so a dead scheduler can never grant free access. A servlet filter with an ordered route table enforces the read-only lock; explicit `require()` calls gate individual paid features.

**Tech Stack:** Java 25, Spring Boot 4.1.0, Spring Security, Spring Data JPA, Lombok, Postgres (prod) / H2 in PostgreSQL mode (test), JUnit 5 + MockMvc.

## Global Constraints

- Package root: `io.github.baeyung.hisaabkitaab`. All new billing code lives in `io.github.baeyung.hisaabkitaab.billing`.
- **Billing code must never import `User` or `Store`**, and must never declare a JPA association to them. It keys off a `userId` string. This is the boundary that makes later extraction into a service possible.
- Jackson databind in this project is **Jackson 3**: import `tools.jackson.databind.ObjectMapper`. Jackson *annotations* are still `com.fasterxml.jackson.annotation.*`.
- Spring Boot 4 package layout: MockMvc autoconfiguration is `org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`.
- Money is `Long amountMinor` (paisa) plus a 3-char `currency`. Never `double`, never `float`.
- `billing.enforcement` defaults to **`false`**. With it off, the filter passes everything, `can()` returns `true`, and `limit()` returns `-1`. Existing tests must keep passing untouched.
- Build: `./mvnw` from `src/backend`. Full suite: `./mvnw test`. Single test: `./mvnw test -Dtest=ClassName#methodName`.
- Test classes for API-level tests extend the package-private `ApiTest` base in `io.github.baeyung.hisaabkitaab.api` and must live in that package.
- Existing code style: 4-space indent, opening brace on its own line, Lombok `@RequiredArgsConstructor` for injection.

## Deviations from the spec (deliberate, approved)

1. **The spec says "exactly one public interface."** The write path needs a second one — `Subscriptions` — because trial-start (in `UserServiceImpl`) and the admin endpoint live outside the package. The read surface and write surface are separate interfaces; the boundary discipline (no `User`/`Store` reference) is unchanged.
2. **The spec has `PaymentFailed` set `grace_until`.** Instead, `grace_until = period_end + grace-days` is set whenever a period is set (trial start, activation, admin override). This is what makes grace apply to trial end — which the spec requires but its own mechanism did not deliver — and it makes "repeated failures don't extend grace" structurally impossible to violate. `PaymentFailed` records history only. `Cancel` clears `grace_until`.
3. **The projection is a fold, not an incremental update.** Every write replays the user's full event list. Events per user number in the dozens over years, so the cost is irrelevant, and it makes the "reproducible by folding" acceptance criterion true by construction rather than by discipline.

## File Structure

**Created — `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/`**

| File | Responsibility |
|---|---|
| `Tier.java` | The three tier names |
| `Capability.java` | Boolean paid features |
| `SubscriptionStatus.java` | `TRIALING, ACTIVE, GRACE, LAPSED, CANCELLED` |
| `BillingProperties.java` | `@ConfigurationProperties("billing")` — flag, durations, tier→capability/limit table |
| `BillingEventType.java`, `BillingActor.java` | Event log enums |
| `BillingEvent.java` | Append-only audit row |
| `Subscription.java` | One-row-per-user projection |
| `BillingEventRepository.java`, `SubscriptionRepository.java` | Data access |
| `Access.java` | Public value type: tier, status, capabilities, dates, `canWrite()` |
| `AccessResolver.java` | Pure date logic: `Subscription` + now → `Access` |
| `Entitlements.java` | **Public** read interface |
| `EntitlementsImpl.java` | Wires repository + resolver + properties |
| `BillingCommand.java` | **Public** sealed command types |
| `Subscriptions.java` | **Public** write interface |
| `SubscriptionProjector.java` | Folds an event list into projection state |
| `SubscriptionWriter.java` | The single write door: idempotency → append → fold → save |
| `CapabilityRequiredException.java` | Thrown by `require()` |
| `BillingWriteLockFilter.java` | The ordered route table and the 402 body |
| `BillingExceptionHandler.java` | `@Order(HIGHEST_PRECEDENCE)` advice for the capability path |
| `BillingController.java` | `GET /api/billing/me` |
| `AdminBillingController.java` | `POST /api/admin/billing/{userId}` |
| `BillingIndexInitializer.java` | Creates the partial unique index on Postgres |
| `BillingScheduler.java` | Daily history/notification/reconciliation job |
| `TrialBackfill.java` | One-time rollout grant for existing verified users |

**Modified**

| File | Change |
|---|---|
| `config/SecurityConfig.java` | Register the filter; add `ROLE_ADMIN` rule for `/api/admin/**` |
| `config/EnumCheckConstraintSync.java:47-50` | Register five new enum columns |
| `security/UserPrincipal.java:41-44` | Add `ROLE_ADMIN` for allowlisted verified accounts |
| `security/CustomUserDetailsService.java` | Pass the admin allowlist into `UserPrincipal` |
| `service/impl/UserServiceImpl.java` | Start the trial at both verification points |
| `exception/ApiError.java` | Add a nullable `billing` block |
| `controller/StoreController.java` | Enforce the `stores` limit on create |
| `resources/application.yaml` | Billing config block |
| `HisaabkitaabApplication.java` | `@EnableScheduling`, `@EnableConfigurationProperties` |

---

### Task 1: Tier, capability and configuration model

Pure value types and config binding. No database, no Spring context.

**Files:**
- Create: `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/Tier.java`
- Create: `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/Capability.java`
- Create: `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/SubscriptionStatus.java`
- Create: `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/BillingProperties.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/BillingPropertiesTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `Tier{STANDARD,PREMIUM,CORPORATE}`; `Capability{WHATSAPP_SEND,EMAIL_STATEMENTS}`; `SubscriptionStatus{TRIALING,ACTIVE,GRACE,LAPSED,CANCELLED}`; `BillingProperties` with `isEnforcement()`, `getTrialDays()`, `getTrialTier()`, `getGraceDays()`, `getTiers()`, `Set<Capability> capabilitiesOf(Tier)`, `int limitOf(Tier, String)`.

- [ ] **Step 1: Write the failing test**

Create `BillingPropertiesTest.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BillingPropertiesTest
{
    private BillingProperties props()
    {
        BillingProperties p = new BillingProperties();
        p.setTiers(Map.of(
                Tier.STANDARD, new BillingProperties.TierConfig(Set.of(), Map.of("stores", 1)),
                Tier.PREMIUM, new BillingProperties.TierConfig(Set.of(Capability.WHATSAPP_SEND), Map.of("stores", 3)),
                Tier.CORPORATE, new BillingProperties.TierConfig(
                        Set.of(Capability.WHATSAPP_SEND, Capability.EMAIL_STATEMENTS), Map.of("stores", -1))));
        return p;
    }

    @Test
    void capabilitiesComeFromTheConfiguredTier()
    {
        assertTrue(props().capabilitiesOf(Tier.PREMIUM).contains(Capability.WHATSAPP_SEND));
        assertFalse(props().capabilitiesOf(Tier.STANDARD).contains(Capability.WHATSAPP_SEND));
    }

    @Test
    void aTierMissingFromConfigGrantsNothingRatherThanEverything()
    {
        BillingProperties p = new BillingProperties();
        p.setTiers(Map.of());
        assertEquals(Set.of(), p.capabilitiesOf(Tier.CORPORATE));
        assertEquals(0, p.limitOf(Tier.CORPORATE, "stores"));
    }

    @Test
    void nullTierGrantsNothing()
    {
        assertEquals(Set.of(), props().capabilitiesOf(null));
        assertEquals(0, props().limitOf(null, "stores"));
    }

    @Test
    void limitsReadBackPerTierAndUnknownLimitsAreZero()
    {
        assertEquals(1, props().limitOf(Tier.STANDARD, "stores"));
        assertEquals(-1, props().limitOf(Tier.CORPORATE, "stores"));
        assertEquals(0, props().limitOf(Tier.PREMIUM, "parties"));
    }

    @Test
    void defaultsAreSafeWhenNothingIsConfigured()
    {
        BillingProperties p = new BillingProperties();
        assertFalse(p.isEnforcement());
        assertEquals(30, p.getTrialDays());
        assertEquals(Tier.PREMIUM, p.getTrialTier());
        assertEquals(5, p.getGraceDays());
    }

    @Test
    void everyTierNameIsDistinctAndOrdered()
    {
        assertEquals(List.of(Tier.STANDARD, Tier.PREMIUM, Tier.CORPORATE), List.of(Tier.values()));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=BillingPropertiesTest`
Expected: FAIL — compilation error, `Tier`/`Capability`/`BillingProperties` do not exist.

- [ ] **Step 3: Write the enums**

`Tier.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

/**
 * The paid tiers, cheapest first. Which capability belongs to which tier is not
 * decided in code — see {@link BillingProperties}. Only the names are fixed here.
 */
public enum Tier
{
    STANDARD,
    PREMIUM,
    CORPORATE
}
```

`Capability.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

/**
 * Boolean paid features. Being an enum rather than a string is the point: an unknown
 * capability name in {@code application.yaml} fails the boot instead of silently
 * ungating a paid feature.
 */
public enum Capability
{
    WHATSAPP_SEND,
    EMAIL_STATEMENTS
}
```

`SubscriptionStatus.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

/**
 * {@code CANCELLED} still writes — the user stopped the renewal but paid through
 * {@code periodEnd}. Only {@code LAPSED} is read-only.
 */
public enum SubscriptionStatus
{
    TRIALING,
    ACTIVE,
    GRACE,
    LAPSED,
    CANCELLED
}
```

- [ ] **Step 4: Write BillingProperties**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.Map;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/**
 * The tier-to-capability table lives in configuration, not in code, because the split
 * between Standard, Premium and Corporate is not yet decided — re-tiering is a config
 * edit and a restart.
 *
 * <p>Every lookup fails closed: an unconfigured tier grants no capabilities and a limit
 * of zero, so a missing config block locks features rather than handing them out.
 */
@ConfigurationProperties("billing")
@Getter
@Setter
public class BillingProperties
{
    /** Master switch. Off means the filter passes everything and every gate answers yes. */
    private boolean enforcement = false;

    private int trialDays = 30;

    private Tier trialTier = Tier.PREMIUM;

    /** Days of full access after a period ends, before the account goes read-only. */
    private int graceDays = 5;

    private Map<Tier, TierConfig> tiers = Map.of();

    /**
     * @param capabilities boolean features this tier unlocks
     * @param limits numeric caps by name; {@code -1} is unlimited, absent is zero
     */
    public record TierConfig(Set<Capability> capabilities, Map<String, Integer> limits)
    {
        public TierConfig
        {
            capabilities = capabilities == null ? Set.of() : Set.copyOf(capabilities);
            limits = limits == null ? Map.of() : Map.copyOf(limits);
        }
    }

    public Set<Capability> capabilitiesOf(Tier tier)
    {
        TierConfig config = tier == null ? null : tiers.get(tier);
        return config == null ? Set.of() : config.capabilities();
    }

    public int limitOf(Tier tier, String name)
    {
        TierConfig config = tier == null ? null : tiers.get(tier);
        return config == null ? 0 : config.limits().getOrDefault(name, 0);
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=BillingPropertiesTest`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/ \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/
git commit -m "feat(billing): tier, capability and configuration model"
```

---

### Task 2: Event log and projection entities

**Files:**
- Create: `billing/BillingEventType.java`, `billing/BillingActor.java`, `billing/BillingEvent.java`, `billing/Subscription.java`, `billing/BillingEventRepository.java`, `billing/SubscriptionRepository.java`
- Modify: `config/EnumCheckConstraintSync.java:47-50`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/BillingRepositoryTest.java`

**Interfaces:**
- Consumes: `Tier`, `SubscriptionStatus` (Task 1).
- Produces: `BillingEvent` (Lombok `@Builder`, fields `id, userId, type, tier, periodStart, periodEnd, actor, actorRef, provider, providerRef, amountMinor, currency, payload, note, createdAt`); `Subscription` (fields `userId` as `@Id`, `tier, status, currentPeriodEnd, graceUntil, lastEventId, version, updatedAt`); `BillingEventRepository.findByUserIdOrderByCreatedAtAscIdAsc(String)`, `.existsByProviderAndProviderRef(String,String)`; `SubscriptionRepository` extends `JpaRepository<Subscription,String>` plus `.findByStatusIn(Collection<SubscriptionStatus>)`.

- [ ] **Step 1: Write the failing test**

Create `BillingRepositoryTest.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class BillingRepositoryTest
{
    @Autowired
    private BillingEventRepository events;

    @Autowired
    private SubscriptionRepository subscriptions;

    private BillingEvent event(String userId, BillingEventType type, Instant createdAt)
    {
        return BillingEvent.builder()
                .userId(userId)
                .type(type)
                .tier(Tier.PREMIUM)
                .actor(BillingActor.SYSTEM)
                .createdAt(createdAt)
                .build();
    }

    @Test
    void eventsComeBackOldestFirstForTheRightUser()
    {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        events.save(event("u2", BillingEventType.TRIAL_STARTED, t0));
        events.save(event("u1", BillingEventType.SUBSCRIBED, t0.plusSeconds(60)));
        events.save(event("u1", BillingEventType.TRIAL_STARTED, t0));

        List<BillingEvent> mine = events.findByUserIdOrderByCreatedAtAscIdAsc("u1");

        assertEquals(2, mine.size());
        assertEquals(BillingEventType.TRIAL_STARTED, mine.get(0).getType());
        assertEquals(BillingEventType.SUBSCRIBED, mine.get(1).getType());
    }

    @Test
    void providerReferenceLookupBacksWebhookIdempotency()
    {
        BillingEvent e = event("u1", BillingEventType.SUBSCRIBED, Instant.now());
        e.setProvider("payfast");
        e.setProviderRef("txn-1");
        events.save(e);

        assertTrue(events.existsByProviderAndProviderRef("payfast", "txn-1"));
        assertFalse(events.existsByProviderAndProviderRef("payfast", "txn-2"));
    }

    @Test
    void subscriptionIsKeyedByUserIdAndReadsBack()
    {
        Subscription s = Subscription.builder()
                .userId("u1")
                .tier(Tier.PREMIUM)
                .status(SubscriptionStatus.TRIALING)
                .currentPeriodEnd(Instant.parse("2026-02-01T00:00:00Z"))
                .graceUntil(Instant.parse("2026-02-06T00:00:00Z"))
                .updatedAt(Instant.now())
                .build();
        subscriptions.save(s);

        Subscription found = subscriptions.findById("u1").orElseThrow();
        assertEquals(Tier.PREMIUM, found.getTier());
        assertEquals(SubscriptionStatus.TRIALING, found.getStatus());
    }

    @Test
    void statusQueryFindsOnlyTheRequestedStatuses()
    {
        subscriptions.save(Subscription.builder().userId("a").tier(Tier.PREMIUM)
                .status(SubscriptionStatus.TRIALING).updatedAt(Instant.now()).build());
        subscriptions.save(Subscription.builder().userId("b").tier(Tier.PREMIUM)
                .status(SubscriptionStatus.LAPSED).updatedAt(Instant.now()).build());

        List<Subscription> live = subscriptions.findByStatusIn(
                List.of(SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE));

        assertEquals(1, live.size());
        assertEquals("a", live.get(0).getUserId());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=BillingRepositoryTest`
Expected: FAIL — compilation error, the entities do not exist.

- [ ] **Step 3: Write the event enums**

`BillingEventType.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

/**
 * {@code GRACE_STARTED} and {@code LAPSED} are written by the daily job purely so the
 * history reads correctly and a notification can be sent. They change no state — the
 * dates on the projection had already decided access before the job ran.
 */
public enum BillingEventType
{
    TRIAL_STARTED,
    SUBSCRIBED,
    RENEWED,
    PAYMENT_FAILED,
    GRACE_STARTED,
    LAPSED,
    TIER_CHANGED,
    CANCELLED,
    ADMIN_OVERRIDE
}
```

`BillingActor.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

/** Who caused an event. {@code actorRef} carries the admin email or the webhook id. */
public enum BillingActor
{
    SYSTEM,
    ADMIN,
    PROVIDER,
    USER
}
```

- [ ] **Step 4: Write the entities**

`BillingEvent.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Append-only. Rows are never updated and never deleted — this is the audit trail, and
 * the {@code subscriptions} projection is derived from it, not the other way round.
 *
 * <p>{@code userId} is a plain column with no JPA association to {@code User}: billing
 * code must not reach into the application's entities, because that association is what
 * would have to be unpicked to extract this package into its own service later.
 */
@Entity
@Table(name = "billing_events", indexes = @Index(name = "billing_events_user_idx", columnList = "user_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BillingEvent
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BillingEventType type;

    @Enumerated(EnumType.STRING)
    private Tier tier;

    private Instant periodStart;

    private Instant periodEnd;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BillingActor actor;

    /** Admin email, or the provider's webhook delivery id. */
    private String actorRef;

    private String provider;

    /** Unique with {@link #provider} where non-null — the webhook idempotency key. */
    private String providerRef;

    /** Paisa. Money is never a floating-point type. */
    private Long amountMinor;

    @Column(length = 3)
    private String currency;

    /** The provider's raw body, stored verbatim so a dispute can be settled from it. */
    @Column(columnDefinition = "text")
    private String payload;

    private String note;

    @Column(nullable = false)
    private Instant createdAt;
}
```

`Subscription.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The projection: one row per user, rewritten by replaying that user's events. Nothing
 * here is authoritative on its own — every field is reproducible from {@code billing_events},
 * which is what the reconciliation job checks.
 *
 * <p>{@code status} is stored, but access is <em>computed</em> from the dates at request
 * time (see {@link AccessResolver}), so an expired subscription locks itself whether or
 * not any scheduled job ran.
 */
@Entity
@Table(name = "subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription
{
    @Id
    @Column(name = "user_id")
    private String userId;

    @Enumerated(EnumType.STRING)
    private Tier tier;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SubscriptionStatus status;

    /** What has been paid or trialed for. */
    private Instant currentPeriodEnd;

    /** Always {@code currentPeriodEnd + billing.grace-days}, or null once cancelled. */
    private Instant graceUntil;

    /** Provenance: the last event folded into this row. */
    private String lastEventId;

    @Version
    private Long version;

    @Column(nullable = false)
    private Instant updatedAt;
}
```

- [ ] **Step 5: Write the repositories**

`BillingEventRepository.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface BillingEventRepository extends JpaRepository<BillingEvent, String>
{
    /** Fold order. Id breaks ties so two events in the same instant fold deterministically. */
    List<BillingEvent> findByUserIdOrderByCreatedAtAscIdAsc(String userId);

    boolean existsByProviderAndProviderRef(String provider, String providerRef);
}
```

`SubscriptionRepository.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface SubscriptionRepository extends JpaRepository<Subscription, String>
{
    List<Subscription> findByStatusIn(Collection<SubscriptionStatus> statuses);
}
```

- [ ] **Step 6: Register the new enum columns**

In `config/EnumCheckConstraintSync.java`, replace the `COLUMNS` list (lines 47-50) with:

```java
    private static final List<EnumColumn> COLUMNS = List.of(
            new EnumColumn("transactions", "event", TransactionEvent.class),
            new EnumColumn("transaction_lines", "target_kind", TargetKind.class),
            new EnumColumn("transaction_lines", "in_out", InOut.class),
            new EnumColumn("billing_events", "type", BillingEventType.class),
            new EnumColumn("billing_events", "tier", Tier.class),
            new EnumColumn("billing_events", "actor", BillingActor.class),
            new EnumColumn("subscriptions", "tier", Tier.class),
            new EnumColumn("subscriptions", "status", SubscriptionStatus.class));
```

Add these imports alongside the existing enum imports:

```java
import io.github.baeyung.hisaabkitaab.billing.BillingActor;
import io.github.baeyung.hisaabkitaab.billing.BillingEventType;
import io.github.baeyung.hisaabkitaab.billing.SubscriptionStatus;
import io.github.baeyung.hisaabkitaab.billing.Tier;
```

Note: `BillingEventType`, `BillingActor`, `SubscriptionStatus` and `Tier` are all public enums, so this cross-package reference is legal and does not breach the boundary — the boundary rule is that *billing* must not import *application* types, not the reverse.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd src/backend && ./mvnw test -Dtest='BillingRepositoryTest,EnumCheckConstraintSyncTest'`
Expected: PASS. `EnumCheckConstraintSyncTest` must still pass — if it asserts on the size or content of `COLUMNS`, update that assertion to match the eight entries.

- [ ] **Step 8: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/ \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/config/EnumCheckConstraintSync.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/
git commit -m "feat(billing): append-only event log and subscription projection"
```

---

### Task 3: Access resolution from dates

The core rule. Pure logic against an injected `Clock`, so it is testable without sleeping.

**Files:**
- Create: `billing/Access.java`, `billing/AccessResolver.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/AccessResolverTest.java`

**Interfaces:**
- Consumes: `Subscription`, `Tier`, `SubscriptionStatus`, `Capability`, `BillingProperties`.
- Produces: `public record Access(Tier tier, SubscriptionStatus status, Set<Capability> capabilities, Instant periodEnd, Instant graceUntil)` with `boolean canWrite()` and `static Access none()`; `AccessResolver(BillingProperties, Clock)` with `Access resolve(Subscription)` accepting null.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccessResolverTest
{
    private static final Instant NOW = Instant.parse("2026-06-15T12:00:00Z");

    private AccessResolver resolver()
    {
        BillingProperties p = new BillingProperties();
        p.setEnforcement(true);
        p.setTiers(Map.of(
                Tier.STANDARD, new BillingProperties.TierConfig(Set.of(), Map.of("stores", 1)),
                Tier.PREMIUM, new BillingProperties.TierConfig(Set.of(Capability.WHATSAPP_SEND), Map.of("stores", 3))));
        return new AccessResolver(p, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private Subscription sub(SubscriptionStatus status, Instant periodEnd, Instant graceUntil)
    {
        return Subscription.builder()
                .userId("u1").tier(Tier.PREMIUM).status(status)
                .currentPeriodEnd(periodEnd).graceUntil(graceUntil)
                .updatedAt(NOW).build();
    }

    @Test
    void noSubscriptionRowIsLapsedAndCannotWrite()
    {
        Access a = resolver().resolve(null);
        assertEquals(SubscriptionStatus.LAPSED, a.status());
        assertFalse(a.canWrite());
        assertEquals(Set.of(), a.capabilities());
    }

    @Test
    void withinThePeriodTheStoredStatusStands()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.TRIALING, NOW.plusSeconds(86400), NOW.plusSeconds(500000)));
        assertEquals(SubscriptionStatus.TRIALING, a.status());
        assertTrue(a.canWrite());
        assertTrue(a.capabilities().contains(Capability.WHATSAPP_SEND));
    }

    @Test
    void pastThePeriodButInsideGraceIsGraceAndStillWrites()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.ACTIVE, NOW.minusSeconds(86400), NOW.plusSeconds(86400)));
        assertEquals(SubscriptionStatus.GRACE, a.status());
        assertTrue(a.canWrite());
    }

    @Test
    void graceKeepsTheTiersCapabilities()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.ACTIVE, NOW.minusSeconds(86400), NOW.plusSeconds(86400)));
        assertTrue(a.capabilities().contains(Capability.WHATSAPP_SEND));
    }

    @Test
    void pastGraceIsLapsedAndLosesEveryCapability()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.ACTIVE, NOW.minusSeconds(200000), NOW.minusSeconds(100000)));
        assertEquals(SubscriptionStatus.LAPSED, a.status());
        assertFalse(a.canWrite());
        assertEquals(Set.of(), a.capabilities());
    }

    @Test
    void cancelledStillWritesUntilTheEndOfThePaidPeriod()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.CANCELLED, NOW.plusSeconds(86400), null));
        assertEquals(SubscriptionStatus.CANCELLED, a.status());
        assertTrue(a.canWrite());
    }

    @Test
    void cancelledLapsesTheMomentThePeriodEndsBecauseGraceWasCleared()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.CANCELLED, NOW.minusSeconds(1), null));
        assertEquals(SubscriptionStatus.LAPSED, a.status());
        assertFalse(a.canWrite());
    }

    @Test
    void aNullPeriodEndIsTreatedAsExpiredNotAsUnlimited()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.ACTIVE, null, null));
        assertEquals(SubscriptionStatus.LAPSED, a.status());
        assertFalse(a.canWrite());
    }

    @Test
    void theTierIsStillReportedWhenLapsedSoTheUpgradePromptKnowsWhatToOffer()
    {
        Access a = resolver().resolve(sub(SubscriptionStatus.ACTIVE, NOW.minusSeconds(200000), null));
        assertEquals(Tier.PREMIUM, a.tier());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=AccessResolverTest`
Expected: FAIL — `Access` and `AccessResolver` do not exist.

- [ ] **Step 3: Write Access**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;
import java.util.Set;

/**
 * A resolved answer to "what may this user do right now". {@code status} here is the
 * <em>effective</em> status computed from dates, which is not necessarily the status
 * stored on the row.
 */
public record Access(
        Tier tier,
        SubscriptionStatus status,
        Set<Capability> capabilities,
        Instant periodEnd,
        Instant graceUntil)
{
    public Access
    {
        capabilities = capabilities == null ? Set.of() : Set.copyOf(capabilities);
    }

    /** Everything except {@code LAPSED} may write. Cancelled users paid for the rest of the period. */
    public boolean canWrite()
    {
        return status != SubscriptionStatus.LAPSED;
    }

    public boolean has(Capability capability)
    {
        return capabilities.contains(capability);
    }

    /** A user with no subscription row at all: fail closed. */
    public static Access none()
    {
        return new Access(null, SubscriptionStatus.LAPSED, Set.of(), null, null);
    }
}
```

- [ ] **Step 4: Write AccessResolver**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Clock;
import java.time.Instant;
import java.util.Set;

import org.springframework.stereotype.Component;

/**
 * Turns a stored subscription into an effective access decision, using the clock rather
 * than the stored status. This is why a dead scheduler cannot grant free access: nothing
 * has to run for an expired subscription to stop writing.
 */
@Component
class AccessResolver
{
    private final BillingProperties properties;

    private final Clock clock;

    AccessResolver(BillingProperties properties, Clock clock)
    {
        this.properties = properties;
        this.clock = clock;
    }

    Access resolve(Subscription subscription)
    {
        if (subscription == null)
        {
            return Access.none();
        }

        Instant now = clock.instant();
        Instant periodEnd = subscription.getCurrentPeriodEnd();
        Instant graceUntil = subscription.getGraceUntil();
        Tier tier = subscription.getTier();

        SubscriptionStatus effective;
        if (periodEnd != null && !now.isAfter(periodEnd))
        {
            effective = subscription.getStatus();
        }
        else if (graceUntil != null && !now.isAfter(graceUntil))
        {
            effective = SubscriptionStatus.GRACE;
        }
        else
        {
            effective = SubscriptionStatus.LAPSED;
        }

        // A lapsed user keeps their tier on the response — the upgrade prompt needs to know
        // what they had — but loses every capability that tier granted.
        Set<Capability> capabilities = effective == SubscriptionStatus.LAPSED
                ? Set.of()
                : properties.capabilitiesOf(tier);

        return new Access(tier, effective, capabilities, periodEnd, graceUntil);
    }
}
```

- [ ] **Step 5: Add the Clock bean**

Create `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/config/ClockConfig.java`:

```java
package io.github.baeyung.hisaabkitaab.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * A single injectable clock so time-dependent logic — subscription expiry above all —
 * can be tested at a fixed instant instead of by sleeping.
 */
@Configuration
public class ClockConfig
{
    @Bean
    Clock clock()
    {
        return Clock.systemUTC();
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=AccessResolverTest`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/Access.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/AccessResolver.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/config/ClockConfig.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/AccessResolverTest.java
git commit -m "feat(billing): compute effective access from dates, not stored status"
```

---

### Task 4: The Entitlements read interface

**Files:**
- Create: `billing/Entitlements.java`, `billing/EntitlementsImpl.java`, `billing/CapabilityRequiredException.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/EntitlementsImplTest.java`

**Interfaces:**
- Consumes: `AccessResolver`, `SubscriptionRepository`, `BillingProperties`, `Access`.
- Produces: `public interface Entitlements { Access access(String userId); boolean can(String,Capability); void require(String,Capability); int limit(String,String); }`; `public class CapabilityRequiredException extends RuntimeException` with `getCapability()` and `getAccess()`.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EntitlementsImplTest
{
    private static final Instant NOW = Instant.parse("2026-06-15T12:00:00Z");

    private final SubscriptionRepository repository = Mockito.mock(SubscriptionRepository.class);

    private BillingProperties properties(boolean enforcement)
    {
        BillingProperties p = new BillingProperties();
        p.setEnforcement(enforcement);
        p.setTiers(Map.of(
                Tier.STANDARD, new BillingProperties.TierConfig(Set.of(), Map.of("stores", 1)),
                Tier.PREMIUM, new BillingProperties.TierConfig(Set.of(Capability.WHATSAPP_SEND), Map.of("stores", 3))));
        return p;
    }

    private EntitlementsImpl entitlements(boolean enforcement)
    {
        BillingProperties p = properties(enforcement);
        return new EntitlementsImpl(repository, new AccessResolver(p, Clock.fixed(NOW, ZoneOffset.UTC)), p);
    }

    private void given(Tier tier, Instant periodEnd)
    {
        Mockito.when(repository.findById("u1")).thenReturn(Optional.of(Subscription.builder()
                .userId("u1").tier(tier).status(SubscriptionStatus.ACTIVE)
                .currentPeriodEnd(periodEnd).updatedAt(NOW).build()));
    }

    @Test
    void enforcementOffGrantsEverythingWithoutTouchingTheDatabase()
    {
        Mockito.when(repository.findById("u1")).thenReturn(Optional.empty());
        EntitlementsImpl e = entitlements(false);

        assertTrue(e.can("u1", Capability.WHATSAPP_SEND));
        assertEquals(-1, e.limit("u1", "stores"));
        assertDoesNotThrow(() -> e.require("u1", Capability.WHATSAPP_SEND));
        assertTrue(e.access("u1").canWrite());
    }

    @Test
    void anActivePremiumUserHasPremiumCapabilities()
    {
        given(Tier.PREMIUM, NOW.plusSeconds(86400));
        assertTrue(entitlements(true).can("u1", Capability.WHATSAPP_SEND));
    }

    @Test
    void anActiveStandardUserDoesNot()
    {
        given(Tier.STANDARD, NOW.plusSeconds(86400));
        assertFalse(entitlements(true).can("u1", Capability.WHATSAPP_SEND));
    }

    @Test
    void requireThrowsCarryingBothTheCapabilityAndTheCurrentAccess()
    {
        given(Tier.STANDARD, NOW.plusSeconds(86400));

        CapabilityRequiredException ex = assertThrows(CapabilityRequiredException.class,
                () -> entitlements(true).require("u1", Capability.WHATSAPP_SEND));

        assertEquals(Capability.WHATSAPP_SEND, ex.getCapability());
        assertEquals(Tier.STANDARD, ex.getAccess().tier());
    }

    @Test
    void aLapsedUserLosesCapabilitiesAndLimitsDropToZero()
    {
        given(Tier.PREMIUM, NOW.minusSeconds(86400));
        EntitlementsImpl e = entitlements(true);

        assertFalse(e.can("u1", Capability.WHATSAPP_SEND));
        assertEquals(0, e.limit("u1", "stores"));
    }

    @Test
    void limitsComeFromTheTierWhileAccessHolds()
    {
        given(Tier.PREMIUM, NOW.plusSeconds(86400));
        assertEquals(3, entitlements(true).limit("u1", "stores"));
    }

    @Test
    void aUserWithNoRowCannotWriteWhenEnforcementIsOn()
    {
        Mockito.when(repository.findById("u1")).thenReturn(Optional.empty());
        assertFalse(entitlements(true).access("u1").canWrite());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=EntitlementsImplTest`
Expected: FAIL — `Entitlements`, `EntitlementsImpl`, `CapabilityRequiredException` do not exist.

- [ ] **Step 3: Write the exception**

```java
package io.github.baeyung.hisaabkitaab.billing;

import lombok.Getter;

/**
 * Thrown by {@link Entitlements#require} when a paid feature is used on a tier that does
 * not include it. Carries the current access so the 402 body can tell the SPA what the
 * user has and what they would need.
 */
@Getter
public class CapabilityRequiredException extends RuntimeException
{
    private final transient Capability capability;

    private final transient Access access;

    public CapabilityRequiredException(Capability capability, Access access)
    {
        super("Capability " + capability + " is not included in the current plan");
        this.capability = capability;
        this.access = access;
    }
}
```

- [ ] **Step 4: Write the interface and implementation**

`Entitlements.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

/**
 * The read side of billing, and one of only two types the rest of the application may
 * touch in this package (the other being {@link Subscriptions}). Everything behind it is
 * package-private, so a later extraction into a separate service is a matter of
 * reimplementing this interface as an HTTP client.
 *
 * <p>Every method answers permissively when {@code billing.enforcement} is off.
 */
public interface Entitlements
{
    /** Effective tier, status, capabilities and dates for this user right now. */
    Access access(String userId);

    boolean can(String userId, Capability capability);

    /** @throws CapabilityRequiredException when the tier does not include the capability */
    void require(String userId, Capability capability);

    /** {@code -1} is unlimited, {@code 0} means not permitted. */
    int limit(String userId, String name);
}
```

`EntitlementsImpl.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class EntitlementsImpl implements Entitlements
{
    /** What every gate answers while the master switch is off. */
    private static final Access UNENFORCED = new Access(
            null, SubscriptionStatus.ACTIVE, Set.of(Capability.values()), null, null);

    private final SubscriptionRepository subscriptions;

    private final AccessResolver resolver;

    private final BillingProperties properties;

    EntitlementsImpl(SubscriptionRepository subscriptions, AccessResolver resolver, BillingProperties properties)
    {
        this.subscriptions = subscriptions;
        this.resolver = resolver;
        this.properties = properties;
    }

    @Override
    @Transactional(readOnly = true)
    public Access access(String userId)
    {
        if (!properties.isEnforcement())
        {
            return UNENFORCED;
        }
        return resolver.resolve(subscriptions.findById(userId).orElse(null));
    }

    @Override
    public boolean can(String userId, Capability capability)
    {
        return !properties.isEnforcement() || access(userId).has(capability);
    }

    @Override
    public void require(String userId, Capability capability)
    {
        if (!properties.isEnforcement())
        {
            return;
        }
        Access current = access(userId);
        if (!current.has(capability))
        {
            throw new CapabilityRequiredException(capability, current);
        }
    }

    @Override
    public int limit(String userId, String name)
    {
        if (!properties.isEnforcement())
        {
            return -1;
        }
        Access current = access(userId);
        // A lapsed user is not merely capped, they are stopped: no tier lookup applies.
        return current.canWrite() ? properties.limitOf(current.tier(), name) : 0;
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=EntitlementsImplTest`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/ \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/EntitlementsImplTest.java
git commit -m "feat(billing): Entitlements read interface with enforcement kill switch"
```

---

### Task 5: The projector — folding events into state

**Files:**
- Create: `billing/SubscriptionProjector.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/SubscriptionProjectorTest.java`

**Interfaces:**
- Consumes: `BillingEvent`, `Subscription`, `BillingProperties`.
- Produces: `SubscriptionProjector(BillingProperties)` with `Subscription project(String userId, List<BillingEvent> events, Instant updatedAt)`.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class SubscriptionProjectorTest
{
    private static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    private SubscriptionProjector projector()
    {
        BillingProperties p = new BillingProperties();
        p.setGraceDays(5);
        return new SubscriptionProjector(p);
    }

    private BillingEvent event(BillingEventType type, Tier tier, Instant periodEnd, Instant createdAt)
    {
        return BillingEvent.builder()
                .id(type.name() + createdAt)
                .userId("u1").type(type).tier(tier)
                .periodEnd(periodEnd).actor(BillingActor.SYSTEM).createdAt(createdAt)
                .build();
    }

    @Test
    void anEmptyLogProjectsALapsedSubscription()
    {
        Subscription s = projector().project("u1", List.of(), T0);
        assertEquals(SubscriptionStatus.LAPSED, s.getStatus());
        assertNull(s.getCurrentPeriodEnd());
    }

    @Test
    void trialStartedSetsTrialingWithGraceDerivedFromThePeriodEnd()
    {
        Instant end = T0.plusSeconds(30 * 86400);
        Subscription s = projector().project("u1",
                List.of(event(BillingEventType.TRIAL_STARTED, Tier.PREMIUM, end, T0)), T0);

        assertEquals(SubscriptionStatus.TRIALING, s.getStatus());
        assertEquals(Tier.PREMIUM, s.getTier());
        assertEquals(end, s.getCurrentPeriodEnd());
        assertEquals(end.plusSeconds(5 * 86400), s.getGraceUntil());
    }

    @Test
    void subscribedOverridesATrialAndBecomesActive()
    {
        Instant trialEnd = T0.plusSeconds(30 * 86400);
        Instant paidEnd = T0.plusSeconds(60 * 86400);
        Subscription s = projector().project("u1", List.of(
                event(BillingEventType.TRIAL_STARTED, Tier.PREMIUM, trialEnd, T0),
                event(BillingEventType.SUBSCRIBED, Tier.STANDARD, paidEnd, T0.plusSeconds(10))), T0);

        assertEquals(SubscriptionStatus.ACTIVE, s.getStatus());
        assertEquals(Tier.STANDARD, s.getTier());
        assertEquals(paidEnd, s.getCurrentPeriodEnd());
    }

    @Test
    void tierChangeMovesTheTierAndLeavesTheStatusAndPeriodAlone()
    {
        Instant end = T0.plusSeconds(30 * 86400);
        Subscription s = projector().project("u1", List.of(
                event(BillingEventType.TRIAL_STARTED, Tier.PREMIUM, end, T0),
                event(BillingEventType.TIER_CHANGED, Tier.CORPORATE, null, T0.plusSeconds(10))), T0);

        assertEquals(Tier.CORPORATE, s.getTier());
        assertEquals(SubscriptionStatus.TRIALING, s.getStatus());
        assertEquals(end, s.getCurrentPeriodEnd());
    }

    @Test
    void cancellingClearsGraceSoAccessStopsExactlyAtThePeriodEnd()
    {
        Instant end = T0.plusSeconds(30 * 86400);
        Subscription s = projector().project("u1", List.of(
                event(BillingEventType.SUBSCRIBED, Tier.PREMIUM, end, T0),
                event(BillingEventType.CANCELLED, null, null, T0.plusSeconds(10))), T0);

        assertEquals(SubscriptionStatus.CANCELLED, s.getStatus());
        assertEquals(end, s.getCurrentPeriodEnd());
        assertNull(s.getGraceUntil());
    }

    @Test
    void repeatedPaymentFailuresChangeNoStateAtAll()
    {
        Instant end = T0.plusSeconds(30 * 86400);
        Subscription once = projector().project("u1", List.of(
                event(BillingEventType.SUBSCRIBED, Tier.PREMIUM, end, T0),
                event(BillingEventType.PAYMENT_FAILED, null, null, T0.plusSeconds(10))), T0);
        Subscription fiveTimes = projector().project("u1", List.of(
                event(BillingEventType.SUBSCRIBED, Tier.PREMIUM, end, T0),
                event(BillingEventType.PAYMENT_FAILED, null, null, T0.plusSeconds(10)),
                event(BillingEventType.PAYMENT_FAILED, null, null, T0.plusSeconds(20)),
                event(BillingEventType.PAYMENT_FAILED, null, null, T0.plusSeconds(30)),
                event(BillingEventType.PAYMENT_FAILED, null, null, T0.plusSeconds(40)),
                event(BillingEventType.PAYMENT_FAILED, null, null, T0.plusSeconds(50))), T0);

        assertEquals(once.getGraceUntil(), fiveTimes.getGraceUntil());
        assertEquals(once.getCurrentPeriodEnd(), fiveTimes.getCurrentPeriodEnd());
        assertEquals(once.getStatus(), fiveTimes.getStatus());
    }

    @Test
    void lapsedAndGraceEventsAreAuditOnlyAndMoveNothing()
    {
        Instant end = T0.plusSeconds(30 * 86400);
        Subscription s = projector().project("u1", List.of(
                event(BillingEventType.SUBSCRIBED, Tier.PREMIUM, end, T0),
                event(BillingEventType.GRACE_STARTED, null, null, T0.plusSeconds(10)),
                event(BillingEventType.LAPSED, null, null, T0.plusSeconds(20))), T0);

        assertEquals(SubscriptionStatus.ACTIVE, s.getStatus());
        assertEquals(end, s.getCurrentPeriodEnd());
    }

    @Test
    void theLastEventIdIsRecordedForProvenance()
    {
        BillingEvent last = event(BillingEventType.SUBSCRIBED, Tier.PREMIUM, T0.plusSeconds(100), T0.plusSeconds(10));
        Subscription s = projector().project("u1",
                List.of(event(BillingEventType.TRIAL_STARTED, Tier.PREMIUM, T0.plusSeconds(50), T0), last), T0);

        assertEquals(last.getId(), s.getLastEventId());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=SubscriptionProjectorTest`
Expected: FAIL — `SubscriptionProjector` does not exist.

- [ ] **Step 3: Write the projector**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Component;

/**
 * Folds a user's event log into the projection row. This is the <em>only</em> place
 * subscription state is derived, so the projection is reproducible from the log by
 * construction — the writer calls it on every write and the reconciliation job calls
 * the same method to check the answer still agrees.
 *
 * <p>Grace is always {@code periodEnd + grace-days}, set wherever a period is set. That
 * is what gives a trial that simply ends the same grace window as a failed renewal, and
 * it is why repeated payment failures cannot extend the window: no code path moves it.
 */
@Component
class SubscriptionProjector
{
    private final BillingProperties properties;

    SubscriptionProjector(BillingProperties properties)
    {
        this.properties = properties;
    }

    Subscription project(String userId, List<BillingEvent> events, Instant updatedAt)
    {
        Subscription state = Subscription.builder()
                .userId(userId)
                .status(SubscriptionStatus.LAPSED)
                .updatedAt(updatedAt)
                .build();

        for (BillingEvent event : events)
        {
            apply(state, event);
            state.setLastEventId(event.getId());
        }
        return state;
    }

    private void apply(Subscription state, BillingEvent event)
    {
        switch (event.getType())
        {
            case TRIAL_STARTED -> startPeriod(state, event, SubscriptionStatus.TRIALING);
            case SUBSCRIBED, RENEWED, ADMIN_OVERRIDE -> startPeriod(state, event, SubscriptionStatus.ACTIVE);
            case TIER_CHANGED ->
            {
                if (event.getTier() != null)
                {
                    state.setTier(event.getTier());
                }
            }
            case CANCELLED ->
            {
                state.setStatus(SubscriptionStatus.CANCELLED);
                // No grace after a deliberate cancellation: access stops at the paid-for date.
                state.setGraceUntil(null);
            }
            // History and notification only. The dates already decided access before these
            // were written, so folding them must not move anything.
            case PAYMENT_FAILED, GRACE_STARTED, LAPSED ->
            {
            }
        }
    }

    private void startPeriod(Subscription state, BillingEvent event, SubscriptionStatus status)
    {
        if (event.getTier() != null)
        {
            state.setTier(event.getTier());
        }
        if (event.getPeriodEnd() != null)
        {
            state.setCurrentPeriodEnd(event.getPeriodEnd());
            state.setGraceUntil(event.getPeriodEnd().plus(Duration.ofDays(properties.getGraceDays())));
        }
        state.setStatus(status);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=SubscriptionProjectorTest`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/SubscriptionProjector.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/SubscriptionProjectorTest.java
git commit -m "feat(billing): fold event log into subscription state"
```

---

### Task 6: The single write door

**Files:**
- Create: `billing/BillingCommand.java`, `billing/Subscriptions.java`, `billing/SubscriptionWriter.java`, `billing/BillingIndexInitializer.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/SubscriptionWriterTest.java`

**Interfaces:**
- Consumes: `BillingEventRepository`, `SubscriptionRepository`, `SubscriptionProjector`, `BillingProperties`, `AccessResolver`, `Clock`.
- Produces: `public sealed interface BillingCommand` permitting the six records below, each with `String userId()`; `public interface Subscriptions { Access apply(BillingCommand command); }`.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {"billing.enforcement=true", "billing.grace-days=5", "billing.trial-days=30"})
@Transactional
class SubscriptionWriterTest
{
    @Autowired
    private Subscriptions subscriptions;

    @Autowired
    private BillingEventRepository events;

    @Autowired
    private SubscriptionRepository projections;

    @Test
    void startingATrialWritesOneEventAndOneProjection()
    {
        Access access = subscriptions.apply(new BillingCommand.StartTrial("u1"));

        assertEquals(SubscriptionStatus.TRIALING, access.status());
        assertEquals(Tier.PREMIUM, access.tier());
        assertEquals(1, events.findByUserIdOrderByCreatedAtAscIdAsc("u1").size());
        assertNotNull(projections.findById("u1").orElseThrow().getCurrentPeriodEnd());
    }

    @Test
    void startingATrialTwiceIsANoOpSoReVerifyingCannotMintASecondTrial()
    {
        subscriptions.apply(new BillingCommand.StartTrial("u1"));
        subscriptions.apply(new BillingCommand.StartTrial("u1"));

        assertEquals(1, events.findByUserIdOrderByCreatedAtAscIdAsc("u1").size());
    }

    @Test
    void graceIsAlwaysThePeriodEndPlusTheConfiguredDays()
    {
        subscriptions.apply(new BillingCommand.StartTrial("u1"));

        Subscription s = projections.findById("u1").orElseThrow();
        assertEquals(s.getCurrentPeriodEnd().plusSeconds(5 * 86400), s.getGraceUntil());
    }

    @Test
    void replayingTheSameProviderReferenceProducesNoSecondEvent()
    {
        Instant end = Instant.now().plusSeconds(86400);
        BillingCommand.Activate cmd = new BillingCommand.Activate(
                "u1", Tier.STANDARD, end, "payfast", "txn-1", 300000L, "PKR", "{}");

        subscriptions.apply(cmd);
        subscriptions.apply(cmd);

        assertEquals(1, events.findByUserIdOrderByCreatedAtAscIdAsc("u1").size());
        assertEquals(Tier.STANDARD, projections.findById("u1").orElseThrow().getTier());
    }

    @Test
    void fivePaymentFailuresDoNotMoveTheGraceWindow()
    {
        Instant end = Instant.now().plusSeconds(86400);
        subscriptions.apply(new BillingCommand.Activate("u1", Tier.PREMIUM, end, null, null, null, null, null));
        Instant graceBefore = projections.findById("u1").orElseThrow().getGraceUntil();

        for (int i = 0; i < 5; i++)
        {
            subscriptions.apply(new BillingCommand.PaymentFailed("u1", "card declined", "payfast", "fail-" + i, "{}"));
        }

        assertEquals(graceBefore, projections.findById("u1").orElseThrow().getGraceUntil());
        assertEquals(6, events.findByUserIdOrderByCreatedAtAscIdAsc("u1").size());
    }

    @Test
    void cancellingClearsGraceAndKeepsThePaidPeriod()
    {
        Instant end = Instant.now().plusSeconds(86400);
        subscriptions.apply(new BillingCommand.Activate("u1", Tier.PREMIUM, end, null, null, null, null, null));

        Access access = subscriptions.apply(new BillingCommand.Cancel("u1"));

        assertEquals(SubscriptionStatus.CANCELLED, access.status());
        assertTrue(access.canWrite());
        assertNull(projections.findById("u1").orElseThrow().getGraceUntil());
    }

    @Test
    void adminOverrideRecordsWhoDidItAndWhy()
    {
        subscriptions.apply(new BillingCommand.AdminOverride("u1", Tier.CORPORATE,
                Instant.now().plusSeconds(86400), "admin@x.com", "goodwill after outage"));

        BillingEvent e = events.findByUserIdOrderByCreatedAtAscIdAsc("u1").get(0);
        assertEquals(BillingActor.ADMIN, e.getActor());
        assertEquals("admin@x.com", e.getActorRef());
        assertEquals("goodwill after outage", e.getNote());
    }

    @Test
    void theProjectionAlwaysEqualsAFreshFoldOfTheLog()
    {
        Instant end = Instant.now().plusSeconds(86400);
        subscriptions.apply(new BillingCommand.StartTrial("u1"));
        subscriptions.apply(new BillingCommand.Activate("u1", Tier.STANDARD, end, null, null, null, null, null));
        subscriptions.apply(new BillingCommand.ChangeTier("u1", Tier.CORPORATE));

        Subscription stored = projections.findById("u1").orElseThrow();
        assertEquals(Tier.CORPORATE, stored.getTier());
        assertEquals(SubscriptionStatus.ACTIVE, stored.getStatus());
        assertEquals(end, stored.getCurrentPeriodEnd());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=SubscriptionWriterTest`
Expected: FAIL — `Subscriptions` and `BillingCommand` do not exist.

- [ ] **Step 3: Write the commands**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;

/**
 * Every way subscription state can change. Sealed so that adding a case forces the
 * writer's switch to be updated rather than silently falling through.
 */
public sealed interface BillingCommand
{
    String userId();

    /** Idempotency key for provider-originated commands; null for everything else. */
    default String provider()
    {
        return null;
    }

    default String providerRef()
    {
        return null;
    }

    /** Begins the configured trial. A no-op if the user already has any billing history. */
    record StartTrial(String userId) implements BillingCommand
    {
    }

    /** A successful payment: sets tier and period, and therefore grace. */
    record Activate(
            String userId,
            Tier tier,
            Instant periodEnd,
            String provider,
            String providerRef,
            Long amountMinor,
            String currency,
            String payload) implements BillingCommand
    {
    }

    /** History only — the grace window is a function of the period, not of failures. */
    record PaymentFailed(
            String userId,
            String reason,
            String provider,
            String providerRef,
            String payload) implements BillingCommand
    {
    }

    /** Moves the tier without touching the period or status. */
    record ChangeTier(String userId, Tier tier) implements BillingCommand
    {
    }

    /** Stops renewal. Access continues to {@code currentPeriodEnd}, with no grace after it. */
    record Cancel(String userId) implements BillingCommand
    {
    }

    /** Manual support action. {@code note} is mandatory so the audit trail says why. */
    record AdminOverride(
            String userId,
            Tier tier,
            Instant until,
            String adminEmail,
            String note) implements BillingCommand
    {
    }
}
```

- [ ] **Step 4: Write the Subscriptions interface**

```java
package io.github.baeyung.hisaabkitaab.billing;

/**
 * The write side of billing. Every state change in the system goes through this one
 * method — trial start, admin grant, the future payment webhook, and the daily job —
 * so there is no code path that changes state without writing history.
 */
public interface Subscriptions
{
    /** Applies the command and returns the resulting access. Idempotent on {@code providerRef}. */
    Access apply(BillingCommand command);
}
```

- [ ] **Step 5: Write the writer**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * Append the event, replay the log, save the projection — in one transaction, for every
 * command. Rebuilding from the whole log rather than patching the row is what makes the
 * projection provably reproducible; a user accumulates a handful of events a year, so
 * the cost never matters.
 */
@Service
@RequiredArgsConstructor
class SubscriptionWriter implements Subscriptions
{
    private static final Logger log = LoggerFactory.getLogger(SubscriptionWriter.class);

    private final BillingEventRepository events;

    private final SubscriptionRepository subscriptions;

    private final SubscriptionProjector projector;

    private final AccessResolver resolver;

    private final BillingProperties properties;

    private final Clock clock;

    /**
     * No retry on an optimistic conflict: once a transaction has failed that way it is
     * marked rollback-only, so retrying inside it cannot succeed, and retrying outside it
     * would mean re-reading state the caller has already acted on. A conflict — an admin
     * action landing at the same instant as a webhook — propagates, and the caller retries.
     */
    @Override
    @Transactional
    public Access apply(BillingCommand command)
    {
        String userId = command.userId();

        if (alreadyApplied(command))
        {
            log.info("billing command for {} already applied (ref {}), ignoring", userId, command.providerRef());
            return currentAccess(userId);
        }

        if (command instanceof BillingCommand.StartTrial
                && !events.findByUserIdOrderByCreatedAtAscIdAsc(userId).isEmpty())
        {
            // Re-verifying an account must not mint a second trial.
            return currentAccess(userId);
        }

        events.save(toEvent(command));
        // Flush so the replay below sees the row just written.
        events.flush();

        List<BillingEvent> history = events.findByUserIdOrderByCreatedAtAscIdAsc(userId);
        Subscription existing = subscriptions.findById(userId).orElse(null);
        Subscription projected = projector.project(userId, history, clock.instant());
        if (existing != null)
        {
            projected.setVersion(existing.getVersion());
        }

        return resolver.resolve(subscriptions.save(projected));
    }

    private boolean alreadyApplied(BillingCommand command)
    {
        return command.provider() != null
                && command.providerRef() != null
                && events.existsByProviderAndProviderRef(command.provider(), command.providerRef());
    }

    private Access currentAccess(String userId)
    {
        return resolver.resolve(subscriptions.findById(userId).orElse(null));
    }

    private BillingEvent toEvent(BillingCommand command)
    {
        Instant now = clock.instant();
        BillingEvent.BillingEventBuilder event = BillingEvent.builder()
                .userId(command.userId())
                .createdAt(now)
                .actor(BillingActor.SYSTEM);

        return switch (command)
        {
            case BillingCommand.StartTrial ignored -> event
                    .type(BillingEventType.TRIAL_STARTED)
                    .tier(properties.getTrialTier())
                    .periodStart(now)
                    .periodEnd(now.plus(Duration.ofDays(properties.getTrialDays())))
                    .note("trial started at verification")
                    .build();

            case BillingCommand.Activate c -> event
                    .type(BillingEventType.SUBSCRIBED)
                    .actor(c.provider() == null ? BillingActor.SYSTEM : BillingActor.PROVIDER)
                    .actorRef(c.providerRef())
                    .tier(c.tier())
                    .periodStart(now)
                    .periodEnd(c.periodEnd())
                    .provider(c.provider())
                    .providerRef(c.providerRef())
                    .amountMinor(c.amountMinor())
                    .currency(c.currency())
                    .payload(c.payload())
                    .build();

            case BillingCommand.PaymentFailed c -> event
                    .type(BillingEventType.PAYMENT_FAILED)
                    .actor(c.provider() == null ? BillingActor.SYSTEM : BillingActor.PROVIDER)
                    .actorRef(c.providerRef())
                    .provider(c.provider())
                    .providerRef(c.providerRef())
                    .payload(c.payload())
                    .note(c.reason())
                    .build();

            case BillingCommand.ChangeTier c -> event
                    .type(BillingEventType.TIER_CHANGED)
                    .tier(c.tier())
                    .build();

            case BillingCommand.Cancel ignored -> event
                    .type(BillingEventType.CANCELLED)
                    .actor(BillingActor.USER)
                    .build();

            case BillingCommand.AdminOverride c -> event
                    .type(BillingEventType.ADMIN_OVERRIDE)
                    .actor(BillingActor.ADMIN)
                    .actorRef(c.adminEmail())
                    .tier(c.tier())
                    .periodStart(now)
                    .periodEnd(c.until())
                    .note(c.note())
                    .build();
        };
    }
}
```

- [ ] **Step 6: Write the index initializer**

```java
package io.github.baeyung.hisaabkitaab.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Hibernate cannot express a partial unique index, and {@code ddl-auto=update} will never
 * add one. This makes duplicate webhook delivery impossible at the database rather than
 * merely unlikely in application code — the check in {@code SubscriptionWriter} is the
 * fast path, this is the guarantee.
 *
 * <p>Postgres only: H2 has no partial indexes, so test runs rely on the application check.
 */
@Component
@RequiredArgsConstructor
public class BillingIndexInitializer
{
    private static final Logger log = LoggerFactory.getLogger(BillingIndexInitializer.class);

    private static final String DDL = """
            CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_ref_uk
            ON billing_events (provider, provider_ref)
            WHERE provider_ref IS NOT NULL
            """;

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void createIndex()
    {
        if (!isPostgres())
        {
            return;
        }
        try
        {
            jdbc.execute(DDL);
        }
        catch (RuntimeException ex)
        {
            log.error("could not create billing_events provider ref index — webhook replays are"
                    + " only guarded by the application check until this is fixed", ex);
        }
    }

    private boolean isPostgres()
    {
        return Boolean.TRUE.equals(jdbc.execute((ConnectionCallback<Boolean>) connection ->
                "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())));
    }
}
```

- [ ] **Step 7: Add the billing config block**

In `src/backend/src/main/resources/application.yaml`, append at the end:

```yaml
# Subscription gating. Off by default: the write-lock filter passes everything and every
# capability check answers yes, so this ships to production dark and is switched on with
# one flag once the data has been seeded and watched.
billing:
  enforcement: ${BILLING_ENFORCEMENT:false}
  trial-days: 30
  trial-tier: PREMIUM
  grace-days: 5
  # Which capability belongs to which tier is not decided yet. Editing this table and
  # restarting is the whole re-tiering procedure — no code change, no deploy of new logic.
  tiers:
    STANDARD:
      capabilities: []
      limits:
        stores: 1
    PREMIUM:
      capabilities: [WHATSAPP_SEND]
      limits:
        stores: 3
    CORPORATE:
      capabilities: [WHATSAPP_SEND, EMAIL_STATEMENTS]
      limits:
        stores: -1
```

In `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/HisaabkitaabApplication.java`, add `@EnableConfigurationProperties(BillingProperties.class)` to the class and import `io.github.baeyung.hisaabkitaab.billing.BillingProperties` plus `org.springframework.boot.context.properties.EnableConfigurationProperties`.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=SubscriptionWriterTest`
Expected: PASS, 8 tests.

- [ ] **Step 9: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/ \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/HisaabkitaabApplication.java \
        src/backend/src/main/resources/application.yaml \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/SubscriptionWriterTest.java
git commit -m "feat(billing): single write door with webhook idempotency"
```

---

### Task 7: Start the trial at verification

**Files:**
- Modify: `service/impl/UserServiceImpl.java` (both places `verified` becomes true)
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/TrialStartApiTest.java`

**Interfaces:**
- Consumes: `Subscriptions.apply(BillingCommand.StartTrial)`.
- Produces: nothing new.

**Critical context:** an account becomes verified in **two** places. `create()` sets `verified = !verificationEnabled`, so in dev and test the account is born verified and `verify()` is never called. Hooking only `verify()` would mean no test or dev account ever gets a trial. Both paths must call the hook, and in `create()` it must come **after** `userRepository.save(user)` because the id does not exist until then.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.api;

import io.github.baeyung.hisaabkitaab.billing.SubscriptionStatus;
import io.github.baeyung.hisaabkitaab.billing.Tier;
import io.github.baeyung.hisaabkitaab.billing.BillingEventRepository;
import io.github.baeyung.hisaabkitaab.billing.Entitlements;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@TestPropertySource(properties = "billing.enforcement=true")
class TrialStartApiTest extends ApiTest
{
    @Autowired
    private Entitlements entitlements;

    @Autowired
    private BillingEventRepository events;

    @Test
    void signingUpWithVerificationOffStartsThePremiumTrialImmediately()
    {
        String userId = signup("03001111111");

        assertEquals(SubscriptionStatus.TRIALING, entitlements.access(userId).status());
        assertEquals(Tier.PREMIUM, entitlements.access(userId).tier());
        assertTrue(entitlements.access(userId).canWrite());
    }

    @Test
    void theTrialIsRecordedAsExactlyOneEvent()
    {
        String userId = signup("03002222222");

        assertEquals(1, events.findByUserIdOrderByCreatedAtAscIdAsc(userId).size());
    }
}
```

Note: `BillingEventRepository` is package-private. For this test to compile, widen it to `public interface BillingEventRepository` in Task 2's file. Do that now — it is the one repository the tests outside the package need to inspect.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=TrialStartApiTest`
Expected: FAIL — status is `LAPSED`, no trial was started.

- [ ] **Step 3: Wire the hook into UserServiceImpl**

Add the imports:

```java
import io.github.baeyung.hisaabkitaab.billing.BillingCommand;
import io.github.baeyung.hisaabkitaab.billing.Subscriptions;
```

Add the field alongside the other injected services:

```java
    private final Subscriptions subscriptions;
```

In `create()`, replace the tail of the method (from `User saved = userRepository.save(user);`) with:

```java
        User saved = userRepository.save(user);
        if (!verified)
        {
            sendVerificationEmail(saved);
        }
        else
        {
            // Dev and test are born verified and never call verify(), so the trial has to
            // start here too — otherwise the gate is untestable and dev accounts get nothing.
            onVerified(saved);
        }
        return saved;
```

In `verify()`, replace the block after `user.setVerificationAttempts(0);` with:

```java
        user.setVerificationAttempts(0);
        onVerified(user);
        if (user.getEmail() != null && !user.getEmail().isBlank())
        {
            welcomeEmailService.sendEmail(user.getEmail(), user.getName(), frontendBaseUrl);
        }
        return true;
```

Add the private helper at the end of the class:

```java
    /**
     * The single point where an account becomes verified turns into a started trial.
     * {@code StartTrial} is a no-op when the user already has billing history, so calling
     * it from both verification paths cannot mint a second trial.
     */
    private void onVerified(User user)
    {
        subscriptions.apply(new BillingCommand.StartTrial(user.getId()));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest='TrialStartApiTest,VerificationApiTest,AuthApiTest'`
Expected: PASS. `VerificationApiTest` exercises the real OTP path and must still pass.

- [ ] **Step 5: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/service/impl/UserServiceImpl.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/BillingEventRepository.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/TrialStartApiTest.java
git commit -m "feat(billing): start the trial at both verification paths"
```

---

### Task 8: The write-lock filter

**Files:**
- Create: `billing/BillingWriteLockFilter.java`
- Modify: `exception/ApiError.java`, `config/SecurityConfig.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/WriteLockApiTest.java`

**Interfaces:**
- Consumes: `Entitlements.access(String)`, `BillingProperties.isEnforcement()`, `UserPrincipal.getId()`.
- Produces: `BillingWriteLockFilter(Entitlements, BillingProperties, ObjectMapper)` — constructed directly in `SecurityConfig`, **not** a Spring bean (a `Filter` bean would be auto-registered in the servlet chain as well as the security chain, running it twice).

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.api;

import java.time.Instant;

import io.github.baeyung.hisaabkitaab.billing.BillingCommand;
import io.github.baeyung.hisaabkitaab.billing.Subscriptions;
import io.github.baeyung.hisaabkitaab.billing.Tier;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = "billing.enforcement=true")
class WriteLockApiTest extends ApiTest
{
    @Autowired
    private Subscriptions subscriptions;

    /** Drives the user past their period and past grace, so they are LAPSED. */
    private void lapse(String userId)
    {
        subscriptions.apply(new BillingCommand.Activate(userId, Tier.PREMIUM,
                Instant.now().minusSeconds(30 * 86400), null, null, null, null, null));
    }

    @Test
    void aTrialingUserCanStillWrite() throws Exception
    {
        String contact = "03101111111";
        signup(contact);

        mvc.perform(post("/api/stores").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Shop\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void aLapsedUserCannotCreateLedgerData() throws Exception
    {
        String contact = "03102222222";
        String userId = signup(contact);
        createStore(contact, "Shop");
        lapse(userId);

        mvc.perform(post("/api/parties").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Ali\"}"))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.billing.status").value("LAPSED"))
                .andExpect(jsonPath("$.billing.tier").value("PREMIUM"));
    }

    @Test
    void aLapsedUserCanStillReadEverything() throws Exception
    {
        String contact = "03103333333";
        String userId = signup(contact);
        createStore(contact, "Shop");
        lapse(userId);

        mvc.perform(get("/api/parties").with(as(contact))).andExpect(status().isOk());
        mvc.perform(get("/api/ledger").with(as(contact))).andExpect(status().isOk());
    }

    @Test
    void aLapsedUserCanStillDelete() throws Exception
    {
        String contact = "03104444444";
        String userId = signup(contact);
        createStore(contact, "Shop");
        String partyId = createParty(contact, "Ali");
        lapse(userId);

        mvc.perform(delete("/api/parties/" + partyId).with(as(contact)))
                .andExpect(status().isNoContent());
    }

    @Test
    void aLapsedUserCanStillPrintBillsBecauseThatPostIsAread() throws Exception
    {
        String contact = "03105555555";
        String userId = signup(contact);
        createStore(contact, "Shop");
        lapse(userId);

        // The endpoint takes a bare List<String> of bill ids, so an empty array is a valid body.
        mvc.perform(post("/api/transactions/bills/details").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("[]"))
                .andExpect(status().isOk());
    }

    @Test
    void aLapsedUserCanStillEditStoreSettings() throws Exception
    {
        String contact = "03106666666";
        String userId = signup(contact);
        String storeId = createStore(contact, "Shop");
        lapse(userId);

        mvc.perform(put("/api/stores/" + storeId).with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void openingCashIsBlockedEvenThoughItLooksLikeAStoreEdit() throws Exception
    {
        String contact = "03107777777";
        String userId = signup(contact);
        createStore(contact, "Shop");
        lapse(userId);

        // PUT /api/stores/{id} is allow-listed and its pattern also matches this path.
        // If the rules are ever reordered, this ledger write silently unlocks.
        mvc.perform(put("/api/stores/opening-cash").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":100}"))
                .andExpect(status().isPaymentRequired());
    }

    @Test
    void authEndpointsStayOpenSoALapsedUserCanStillLogInAndResetTheirPassword() throws Exception
    {
        String contact = "03108888888";
        String userId = signup(contact);
        lapse(userId);

        mvc.perform(get("/api/auth/me").with(as(contact))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"u" + contact + "@x.com\"}"))
                .andExpect(status().isNoContent());
    }

    private String createParty(String contact, String name) throws Exception
    {
        return tree(mvc.perform(post("/api/parties").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk()).andReturn()).get("id").asText();
    }
}
```

Both request bodies above are taken from the real signatures: `getBillDetails` binds `@RequestBody List<String> ids`, and `forgotPassword` binds `ForgotPasswordRequest{email}` and answers `204 No Content`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=WriteLockApiTest`
Expected: FAIL — writes succeed for lapsed users, no 402 anywhere.

- [ ] **Step 3: Extend ApiError**

In `exception/ApiError.java`, add the field after `fieldErrors` and the nested record at the end of the class:

```java
    /** Present only on 402s. Null everywhere else, so no existing response shape changes. */
    private Billing billing;

    /**
     * Deliberately plain strings rather than the billing enums: the error body should not
     * drag a dependency on the billing package into the exception package.
     */
    public record Billing(
            String tier,
            String status,
            String requiredCapability,
            Instant periodEnd,
            Instant graceUntil)
    {
    }
```

- [ ] **Step 4: Write the filter**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.PathContainer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import io.github.baeyung.hisaabkitaab.config.RequestLogFilter;
import io.github.baeyung.hisaabkitaab.exception.ApiError;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import tools.jackson.databind.ObjectMapper;

/**
 * The read-only lock. Anything that is not a safe method is blocked for a lapsed user
 * <em>unless</em> a rule says otherwise — default-deny, so a write endpoint added later is
 * gated without anyone remembering to gate it.
 *
 * <p>The rules are ordered and the first match wins, which is not cosmetic:
 * {@code /api/stores/&#123;id&#125;} also matches {@code /api/stores/opening-cash}, so the
 * "store settings stay editable" allowance would otherwise unlock an opening-balance
 * ledger write. Specific denies must precede general allows.
 *
 * <p>This filter writes its own response rather than throwing. Filters run before
 * {@code DispatcherServlet}, so {@code @RestControllerAdvice} would never see the
 * exception and the caller would get a container error page instead of JSON.
 */
class BillingWriteLockFilter extends OncePerRequestFilter
{
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");

    private static final PathPatternParser PARSER = PathPatternParser.defaultInstance;

    /** First match wins. {@code allow} means "exempt from the lock", not "always permitted". */
    private record Rule(String method, PathPattern pattern, boolean allow)
    {
        boolean matches(String requestMethod, PathContainer path)
        {
            return (method == null || method.equals(requestMethod)) && pattern.matches(path);
        }
    }

    private static Rule rule(String method, String pattern, boolean allow)
    {
        return new Rule(method, PARSER.parse(pattern), allow);
    }

    private static final List<Rule> RULES = List.of(
            // Login, password reset and /me must work for a locked-out user.
            rule(null, "/api/auth/**", true),
            // Deletes stay open: it is the user's own data.
            rule("DELETE", "/api/**", true),
            // A read that uses POST to carry a body. A method-based lock would break printing.
            rule("POST", "/api/transactions/bills/details", true),
            // MUST precede the store-settings rule below — see the class comment.
            rule("PUT", "/api/stores/opening-cash", false),
            // Store name, logo, watermark: settings, not ledger data.
            rule("PUT", "/api/stores/{id}", true));

    private final Entitlements entitlements;

    private final BillingProperties properties;

    private final ObjectMapper json;

    BillingWriteLockFilter(Entitlements entitlements, BillingProperties properties, ObjectMapper json)
    {
        this.entitlements = entitlements;
        this.properties = properties;
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException
    {
        if (!properties.isEnforcement() || SAFE_METHODS.contains(request.getMethod()))
        {
            chain.doFilter(request, response);
            return;
        }

        PathContainer path = PathContainer.parsePath(request.getRequestURI());
        if (isExempt(request.getMethod(), path))
        {
            chain.doFilter(request, response);
            return;
        }

        String userId = currentUserId();
        if (userId == null)
        {
            // Unauthenticated: not our decision to make. Let the security chain answer.
            chain.doFilter(request, response);
            return;
        }

        Access access = entitlements.access(userId);
        if (access.canWrite())
        {
            chain.doFilter(request, response);
            return;
        }

        writePaymentRequired(request, response, access);
    }

    private boolean isExempt(String method, PathContainer path)
    {
        for (Rule rule : RULES)
        {
            if (rule.matches(method, path))
            {
                return rule.allow();
            }
        }
        return false; // Default deny: an unclassified write is subject to the lock.
    }

    private String currentUserId()
    {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()
                || !(auth.getPrincipal() instanceof UserPrincipal principal))
        {
            return null;
        }
        return principal.getId();
    }

    private void writePaymentRequired(HttpServletRequest request, HttpServletResponse response, Access access)
            throws IOException
    {
        ApiError body = ApiError.builder()
                .timestamp(Instant.now())
                .status(HttpStatus.PAYMENT_REQUIRED.value())
                .error(HttpStatus.PAYMENT_REQUIRED.getReasonPhrase())
                .message("Your subscription has ended. You can still view and export your records.")
                .path(request.getRequestURI())
                .traceId(MDC.get(RequestLogFilter.TRACE_ID))
                .billing(new ApiError.Billing(
                        access.tier() == null ? null : access.tier().name(),
                        access.status().name(),
                        null,
                        access.periodEnd(),
                        access.graceUntil()))
                .build();

        response.setStatus(HttpStatus.PAYMENT_REQUIRED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(json.writeValueAsString(body));
    }
}
```

- [ ] **Step 5: Register it in SecurityConfig**

The filter is constructed here rather than being a `@Component`: a `Filter` bean is auto-registered in the servlet chain *as well as* the security chain, which would run it twice.

Add the imports:

```java
import io.github.baeyung.hisaabkitaab.billing.BillingProperties;
import io.github.baeyung.hisaabkitaab.billing.Entitlements;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import tools.jackson.databind.ObjectMapper;
```

Add the constructor parameters and fields:

```java
    private final Entitlements entitlements;

    private final BillingProperties billingProperties;

    private final ObjectMapper objectMapper;

    public SecurityConfig(RestAuthenticationEntryPoint authenticationEntryPoint,
            RestAccessDeniedHandler accessDeniedHandler,
            Entitlements entitlements,
            BillingProperties billingProperties,
            ObjectMapper objectMapper)
    {
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
        this.entitlements = entitlements;
        this.billingProperties = billingProperties;
        this.objectMapper = objectMapper;
    }
```

In `filterChain`, immediately before `return http.build();`:

```java
        // After authorization, so the principal is populated and an unauthenticated request
        // has already been rejected by the time the lock is consulted.
        http.addFilterAfter(
                new BillingWriteLockFilter(entitlements, billingProperties, objectMapper),
                AuthorizationFilter.class);
```

`BillingWriteLockFilter` is package-private, so add a package-private static factory in the billing package for `SecurityConfig` to call — or, simpler, make the class `public`. Make it **public** and note in its Javadoc that it is public solely for registration and must not be called directly.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src/backend && ./mvnw test -Dtest=WriteLockApiTest`
Expected: PASS, 8 tests.

- [ ] **Step 7: Prove the kill switch actually kills**

The acceptance criteria require that a *lapsed* user regains full write access with enforcement
off. That cannot live in `WriteLockApiTest`, which forces the flag on, so it needs its own class.
Create `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/WriteLockDisabledApiTest.java`:

```java
package io.github.baeyung.hisaabkitaab.api;

import java.time.Instant;

import io.github.baeyung.hisaabkitaab.billing.BillingCommand;
import io.github.baeyung.hisaabkitaab.billing.Subscriptions;
import io.github.baeyung.hisaabkitaab.billing.Tier;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The default. If this ever fails, shipping dark is no longer safe. */
@TestPropertySource(properties = "billing.enforcement=false")
class WriteLockDisabledApiTest extends ApiTest
{
    @Autowired
    private Subscriptions subscriptions;

    @Test
    void aLapsedUserWritesFreelyWhileEnforcementIsOff() throws Exception
    {
        String contact = "03401111111";
        String userId = signup(contact);
        createStore(contact, "Shop");
        subscriptions.apply(new BillingCommand.Activate(userId, Tier.PREMIUM,
                Instant.now().minusSeconds(30 * 86400), null, null, null, null, null));

        mvc.perform(post("/api/parties").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Ali\"}"))
                .andExpect(status().isOk());

        mvc.perform(put("/api/stores/opening-cash").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":100}"))
                .andExpect(status().isOk());
    }
}
```

Run: `cd src/backend && ./mvnw test -Dtest=WriteLockDisabledApiTest`
Expected: PASS, 1 test.

- [ ] **Step 8: Run the whole suite — enforcement is off by default, so nothing else may change**

Run: `cd src/backend && ./mvnw test`
Expected: PASS, all pre-existing tests included.

- [ ] **Step 9: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/BillingWriteLockFilter.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/exception/ApiError.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/config/SecurityConfig.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/WriteLockApiTest.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/WriteLockDisabledApiTest.java
git commit -m "feat(billing): read-only write lock with ordered route table"
```

---

### Task 9: Endpoint classification test

The test that makes forgetting impossible. It enumerates every mapping Spring knows about and asserts what the lock does with it.

**Files:**
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/WriteLockCoverageTest.java`

**Interfaces:**
- Consumes: `RequestMappingHandlerMapping`, `BillingWriteLockFilter`.
- Produces: nothing.

- [ ] **Step 1: Expose the classification for testing**

In `BillingWriteLockFilter`, change `isExempt` from `private` to package-private and add a package-private static accessor:

```java
    /** Visible for the coverage test: what the lock would do with this method and path. */
    static boolean exemptFromLock(String method, String path)
    {
        if (SAFE_METHODS.contains(method))
        {
            return true;
        }
        PathContainer container = PathContainer.parsePath(path);
        for (Rule rule : RULES)
        {
            if (rule.matches(method, container))
            {
                return rule.allow();
            }
        }
        return false;
    }
```

- [ ] **Step 2: Write the test**

Create `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/WriteLockCoverageTest.java` (in the billing package, so the package-private accessor is reachable):

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Every write endpoint in the application, and what the read-only lock does with it.
 *
 * <p>When this fails because a new endpoint appeared, that is the point: decide whether it
 * belongs in {@code EXEMPT} and add it here. A new write endpoint is already locked by
 * default — this test exists so nobody discovers that from a customer.
 */
@SpringBootTest
@ActiveProfiles("test")
class WriteLockCoverageTest
{
    /** Write endpoints a lapsed user may still call. Everything else must be locked. */
    private static final Set<String> EXEMPT = Set.of(
            "POST /api/auth/signup",
            "POST /api/auth/verify",
            "POST /api/auth/resend-verification",
            "POST /api/auth/forgot-password",
            "POST /api/auth/verify-reset-otp",
            "POST /api/auth/reset-password",
            "DELETE /api/event/{id}",
            "DELETE /api/parties/{id}",
            "DELETE /api/store-items/{id}",
            "DELETE /api/stores/{id}",
            "DELETE /api/transactions/bills/{id}",
            "POST /api/transactions/bills/details",
            "PUT /api/stores/{id}");

    @Autowired
    private RequestMappingHandlerMapping mappings;

    @Test
    void everyWriteEndpointIsClassifiedAsExpected()
    {
        Map<String, Boolean> actual = new TreeMap<>();

        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : mappings.getHandlerMethods().entrySet())
        {
            RequestMappingInfo info = entry.getKey();
            Set<String> patterns = info.getPathPatternsCondition() == null
                    ? Set.of()
                    : info.getPathPatternsCondition().getPatternValues();

            for (String pattern : patterns)
            {
                if (!pattern.startsWith("/api/"))
                {
                    continue;
                }
                for (var method : info.getMethodsCondition().getMethods())
                {
                    String name = method.name();
                    if (Set.of("GET", "HEAD", "OPTIONS").contains(name))
                    {
                        continue;
                    }
                    actual.put(name + " " + pattern,
                            BillingWriteLockFilter.exemptFromLock(name, samplePath(pattern)));
                }
            }
        }

        Map<String, Boolean> expected = new TreeMap<>();
        actual.keySet().forEach(key -> expected.put(key, EXEMPT.contains(key)));

        assertEquals(expected, actual,
                "A write endpoint's lock classification changed. If you added an endpoint, decide "
                        + "whether a lapsed user may call it and update EXEMPT accordingly.");
    }

    /** Turns a mapping pattern into a concrete path the matcher can be run against. */
    private String samplePath(String pattern)
    {
        return pattern.replaceAll("\\{[^}]+}", "sample");
    }
}
```

- [ ] **Step 3: Run the test**

Run: `cd src/backend && ./mvnw test -Dtest=WriteLockCoverageTest`
Expected: PASS. If it fails, the failure message lists exactly which endpoint disagrees — reconcile `EXEMPT` with the intent in the spec's table, do **not** loosen the filter to make the test green.

- [ ] **Step 4: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/BillingWriteLockFilter.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/WriteLockCoverageTest.java
git commit -m "test(billing): assert the lock classification of every write endpoint"
```

---

### Task 10: Capability gate, 402 advice, and the store limit

**Files:**
- Create: `billing/BillingExceptionHandler.java`
- Modify: `controller/StoreController.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/StoreLimitApiTest.java`

**Interfaces:**
- Consumes: `CapabilityRequiredException`, `Entitlements.limit(String,String)`.
- Produces: `BillingExceptionHandler` returning 402 with `ApiError.Billing` populated.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.api;

import java.time.Instant;

import io.github.baeyung.hisaabkitaab.billing.BillingCommand;
import io.github.baeyung.hisaabkitaab.billing.Subscriptions;
import io.github.baeyung.hisaabkitaab.billing.Tier;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = {
        "billing.enforcement=true",
        "billing.tiers.PREMIUM.limits.stores=2"})
class StoreLimitApiTest extends ApiTest
{
    @Autowired
    private Subscriptions subscriptions;

    @Test
    void storesAreCappedAtTheTiersLimit() throws Exception
    {
        String contact = "03201111111";
        signup(contact);
        createStore(contact, "One");
        createStore(contact, "Two");

        mvc.perform(post("/api/stores").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Three\"}"))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.billing.tier").value("PREMIUM"));
    }

    @Test
    void aLimitOfMinusOneIsUnlimited() throws Exception
    {
        String contact = "03202222222";
        String userId = signup(contact);
        // CORPORATE is configured with stores: -1 in application.yaml. Granted through the
        // writer directly because the admin endpoint only arrives in Task 11.
        subscriptions.apply(new BillingCommand.AdminOverride(userId, Tier.CORPORATE,
                Instant.now().plusSeconds(86400), "test@x.com", "test grant"));

        createStore(contact, "One");
        createStore(contact, "Two");
        createStore(contact, "Three");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=StoreLimitApiTest`
Expected: FAIL — the third store is created with status 200, no limit is enforced.

- [ ] **Step 3: Write the exception handler**

```java
package io.github.baeyung.hisaabkitaab.billing;

import jakarta.servlet.http.HttpServletRequest;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import io.github.baeyung.hisaabkitaab.config.RequestLogFilter;
import io.github.baeyung.hisaabkitaab.exception.ApiError;

/**
 * Turns a capability or limit refusal into 402.
 *
 * <p>{@code @Order(HIGHEST_PRECEDENCE)} is mandatory, not tidiness:
 * {@code GlobalExceptionHandler} declares {@code @ExceptionHandler(Exception.class)}, and
 * without this ordering that catch-all claims these exceptions and reports them as 500s.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class BillingExceptionHandler
{
    private static final Logger log = LoggerFactory.getLogger(BillingExceptionHandler.class);

    @ExceptionHandler(CapabilityRequiredException.class)
    public ResponseEntity<ApiError> handleCapabilityRequired(CapabilityRequiredException ex,
            HttpServletRequest request)
    {
        log.warn("402 {} {}: {}", request.getMethod(), request.getRequestURI(), ex.getMessage());

        Access access = ex.getAccess();
        ApiError body = ApiError.builder()
                .timestamp(Instant.now())
                .status(HttpStatus.PAYMENT_REQUIRED.value())
                .error(HttpStatus.PAYMENT_REQUIRED.getReasonPhrase())
                .message(ex.getMessage())
                .path(request.getRequestURI())
                .traceId(MDC.get(RequestLogFilter.TRACE_ID))
                .billing(new ApiError.Billing(
                        access.tier() == null ? null : access.tier().name(),
                        access.status().name(),
                        ex.getCapability() == null ? null : ex.getCapability().name(),
                        access.periodEnd(),
                        access.graceUntil()))
                .build();

        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(body);
    }
}
```

- [ ] **Step 4: Enforce the store limit**

In `controller/StoreController.java`, add the imports:

```java
import io.github.baeyung.hisaabkitaab.billing.Access;
import io.github.baeyung.hisaabkitaab.billing.CapabilityRequiredException;
import io.github.baeyung.hisaabkitaab.billing.Entitlements;
```

Add the injected field alongside the existing service:

```java
    private final Entitlements entitlements;
```

In the `@PostMapping` create method, before delegating to the service:

```java
        // -1 is unlimited. findByOwner is the same call the list endpoint already makes;
        // a shop owner has a handful of stores, so counting them in memory is not worth a query.
        int allowed = entitlements.limit(principal.getId(), "stores");
        if (allowed >= 0 && storeService.findByOwner(principal.getId()).size() >= allowed)
        {
            throw new CapabilityRequiredException(null, entitlements.access(principal.getId()));
        }
```

`storeService.findByOwner(String)` returning `List<Store>` is confirmed present — it backs the existing `@GetMapping` list endpoint at `StoreController:37`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=StoreLimitApiTest`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify the ordering actually beats the catch-all**

Run: `cd src/backend && ./mvnw test -Dtest='StoreLimitApiTest,ErrorHandlingApiTest'`
Expected: PASS. A 500 in `StoreLimitApiTest` means `@Order` is missing or the advice is not being picked up.

- [ ] **Step 7: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/BillingExceptionHandler.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/controller/StoreController.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/StoreLimitApiTest.java
git commit -m "feat(billing): 402 advice and store limit enforcement"
```

---

### Task 11: Read endpoint and admin endpoint

**Files:**
- Create: `billing/BillingController.java`, `billing/AdminBillingController.java`, `billing/AdminProperties.java`
- Modify: `security/UserPrincipal.java`, `security/CustomUserDetailsService.java`, `config/SecurityConfig.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/BillingEndpointApiTest.java`

**Interfaces:**
- Consumes: `Entitlements.access(String)`, `Subscriptions.apply(BillingCommand)`.
- Produces: `GET /api/billing/me` → `{tier, status, capabilities[], periodEnd, graceUntil, canWrite}`; `POST /api/admin/billing/{userId}` accepting `{tier, until, note}`.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = {
        "billing.enforcement=true",
        "app.admin.emails=admin@x.com"})
class BillingEndpointApiTest extends ApiTest
{
    @Test
    void billingMeReportsTheCurrentTrial() throws Exception
    {
        String contact = "03301111111";
        signup(contact);

        mvc.perform(get("/api/billing/me").with(as(contact)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("PREMIUM"))
                .andExpect(jsonPath("$.status").value("TRIALING"))
                .andExpect(jsonPath("$.canWrite").value(true));
    }

    @Test
    void anOrdinaryUserCannotReachTheAdminEndpoint() throws Exception
    {
        String contact = "03302222222";
        String userId = signup(contact);

        mvc.perform(post("/api/admin/billing/" + userId).with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tier\":\"CORPORATE\",\"until\":\"2027-01-01T00:00:00Z\",\"note\":\"x\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void anAllowlistedAdminCanGrantAPlan() throws Exception
    {
        String target = signup("03303333333");
        signupAdmin();

        mvc.perform(post("/api/admin/billing/" + target).with(as("03309999999"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tier\":\"CORPORATE\",\"until\":\"2027-01-01T00:00:00Z\","
                                + "\"note\":\"goodwill\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("CORPORATE"));
    }

    @Test
    void anAdminGrantWithoutANoteIsRejected() throws Exception
    {
        String target = signup("03304444444");
        signupAdmin();

        mvc.perform(post("/api/admin/billing/" + target).with(as("03309999999"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tier\":\"CORPORATE\",\"until\":\"2027-01-01T00:00:00Z\"}"))
                .andExpect(status().isBadRequest());
    }

    /** Signs up the account whose email matches the configured admin allowlist. */
    private void signupAdmin() throws Exception
    {
        String body = """
                {"name":"Admin","contactNumber":"03309999999","email":"admin@x.com","password":"%s"}
                """.formatted(PASSWORD);
        mvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=BillingEndpointApiTest`
Expected: FAIL — 404 on both endpoints, they do not exist.

- [ ] **Step 3: Write the admin allowlist properties**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.boot.context.properties.ConfigurationProperties;

import lombok.Getter;
import lombok.Setter;

/**
 * Admin identity is configuration, never a column on {@code users}. A restored backup or a
 * single stray {@code UPDATE} must not be able to mint an administrator, and an allowlist
 * that only exists in the deployment's config cannot be written to by the application.
 */
@ConfigurationProperties("app.admin")
@Getter
@Setter
public class AdminProperties
{
    private Set<String> emails = Set.of();

    public boolean isAdmin(String email)
    {
        if (email == null || email.isBlank())
        {
            return false;
        }
        return emails.stream()
                .map(e -> e.toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet())
                .contains(email.toLowerCase(Locale.ROOT));
    }
}
```

Register it: add `AdminProperties.class` to the `@EnableConfigurationProperties` list on `HisaabkitaabApplication`, and add to `application.yaml`:

```yaml
app:
  admin:
    # Comma-separated emails that get ROLE_ADMIN, and only while the account is verified.
    emails: ${ADMIN_EMAILS:}
```

- [ ] **Step 4: Grant ROLE_ADMIN in UserPrincipal**

Replace `UserPrincipal`'s constructor and `getAuthorities()`:

```java
    private final boolean admin;

    public UserPrincipal(User user)
    {
        this(user, false);
    }

    public UserPrincipal(User user, boolean admin)
    {
        this.id = user.getId();
        this.username = user.getEmail();
        this.password = user.getPasswordHash();
        this.user = user;
        this.admin = admin;
    }

    /**
     * A verified account gets {@code ROLE_USER}; an unverified one gets only
     * {@code ROLE_UNVERIFIED}. The password still authenticates either way — the
     * missing role is what makes protected endpoints answer 403 (not 401) for an
     * authenticated-but-unverified user, without leaking verification state on a
     * wrong password.
     *
     * <p>{@code ROLE_ADMIN} is additionally granted to an allowlisted email, and only
     * when the account is verified — an unverified account must never be an admin.
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities()
    {
        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority(user.isVerified() ? "ROLE_USER" : "ROLE_UNVERIFIED"));
        if (admin && user.isVerified())
        {
            authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
        }
        return authorities;
    }
```

Add `import java.util.ArrayList;`.

In `CustomUserDetailsService`, inject `AdminProperties` and construct the principal as
`new UserPrincipal(user, adminProperties.isAdmin(user.getEmail()))`.

- [ ] **Step 5: Add the authorization rule**

In `SecurityConfig.filterChain`, inside the `authorizeHttpRequests` lambda, **before** the `anyRequest()` call:

```java
                    auth.requestMatchers("/api/admin/**").hasRole("ADMIN");
```

- [ ] **Step 6: Write the controllers**

`BillingController.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import lombok.RequiredArgsConstructor;

/**
 * What the SPA needs to render banners and disable buttons. Disabling in the UI is a
 * courtesy — {@link BillingWriteLockFilter} is the actual gate.
 *
 * <p>Separate from {@code GET /api/auth/me}, which serialises the raw {@code User} entity
 * and should not grow.
 */
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController
{
    private final Entitlements entitlements;

    public record BillingStatusResponse(
            Tier tier,
            SubscriptionStatus status,
            List<Capability> capabilities,
            Instant periodEnd,
            Instant graceUntil,
            boolean canWrite)
    {
    }

    @GetMapping("/me")
    public ResponseEntity<BillingStatusResponse> me(@AuthenticationPrincipal UserPrincipal principal)
    {
        Access access = entitlements.access(principal.getId());
        return ResponseEntity.ok(new BillingStatusResponse(
                access.tier(),
                access.status(),
                access.capabilities().stream().sorted().toList(),
                access.periodEnd(),
                access.graceUntil(),
                access.canWrite()));
    }
}
```

`AdminBillingController.java`:

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import lombok.RequiredArgsConstructor;

/**
 * Manual plan grants: support tooling today, and the thing that makes the whole mechanism
 * testable before a payment provider exists. Guarded by {@code ROLE_ADMIN}, which is only
 * held by a verified account whose email is on the configured allowlist.
 *
 * <p>{@code note} is mandatory. An audit trail that records what changed but not why is
 * only half an audit trail.
 */
@RestController
@RequestMapping("/api/admin/billing")
@RequiredArgsConstructor
public class AdminBillingController
{
    private static final Logger log = LoggerFactory.getLogger(AdminBillingController.class);

    private final Subscriptions subscriptions;

    public record GrantRequest(
            @NotNull Tier tier,
            @NotNull Instant until,
            @NotBlank String note)
    {
    }

    public record GrantResponse(Tier tier, SubscriptionStatus status, Instant periodEnd)
    {
    }

    @PostMapping("/{userId}")
    public ResponseEntity<GrantResponse> grant(@PathVariable String userId,
            @Valid @RequestBody GrantRequest request,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        log.warn("admin {} granting {} to user {} until {}: {}",
                principal.getUsername(), request.tier(), userId, request.until(), request.note());

        Access access = subscriptions.apply(new BillingCommand.AdminOverride(
                userId, request.tier(), request.until(), principal.getUsername(), request.note()));

        return ResponseEntity.ok(new GrantResponse(access.tier(), access.status(), access.periodEnd()));
    }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd src/backend && ./mvnw test -Dtest='BillingEndpointApiTest,AuthApiTest,LoginLockoutApiTest'`
Expected: PASS. The auth tests confirm the `UserPrincipal` change did not disturb ordinary login.

- [ ] **Step 8: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/ \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/security/ \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/config/SecurityConfig.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/HisaabkitaabApplication.java \
        src/backend/src/main/resources/application.yaml \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/api/BillingEndpointApiTest.java
git commit -m "feat(billing): billing status endpoint and admin plan grants"
```

---

### Task 12: Daily job — history, reminders, reconciliation

**Files:**
- Create: `billing/BillingScheduler.java`
- Modify: `HisaabkitaabApplication.java` (`@EnableScheduling`)
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/BillingSchedulerTest.java`

**Interfaces:**
- Consumes: `SubscriptionRepository`, `BillingEventRepository`, `SubscriptionProjector`, `AccessResolver`, `Clock`.
- Produces: `BillingScheduler.recordTransitions()`, `BillingScheduler.reconcile()` — both package-private and callable directly from tests.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "billing.enforcement=true")
@Transactional
class BillingSchedulerTest
{
    @Autowired
    private BillingScheduler scheduler;

    @Autowired
    private Subscriptions subscriptions;

    @Autowired
    private BillingEventRepository events;

    @Autowired
    private SubscriptionRepository projections;

    private void activateUntil(String userId, Instant end)
    {
        subscriptions.apply(new BillingCommand.Activate(userId, Tier.PREMIUM, end, null, null, null, null, null));
    }

    @Test
    void anExpiredSubscriptionGetsALapsedEventWritten()
    {
        activateUntil("u1", Instant.now().minusSeconds(30 * 86400));

        scheduler.recordTransitions();

        assertTrue(events.findByUserIdOrderByCreatedAtAscIdAsc("u1").stream()
                .anyMatch(e -> e.getType() == BillingEventType.LAPSED));
    }

    @Test
    void theLapsedEventIsWrittenOnceNotOncePerRun()
    {
        activateUntil("u1", Instant.now().minusSeconds(30 * 86400));

        scheduler.recordTransitions();
        scheduler.recordTransitions();
        scheduler.recordTransitions();

        assertEquals(1, events.findByUserIdOrderByCreatedAtAscIdAsc("u1").stream()
                .filter(e -> e.getType() == BillingEventType.LAPSED)
                .count());
    }

    @Test
    void aSubscriptionInsideGraceGetsAGraceEventNotALapsedOne()
    {
        activateUntil("u2", Instant.now().minusSeconds(86400));

        scheduler.recordTransitions();

        List<BillingEvent> log = events.findByUserIdOrderByCreatedAtAscIdAsc("u2");
        assertTrue(log.stream().anyMatch(e -> e.getType() == BillingEventType.GRACE_STARTED));
        assertTrue(log.stream().noneMatch(e -> e.getType() == BillingEventType.LAPSED));
    }

    @Test
    void aLiveSubscriptionIsLeftAlone()
    {
        activateUntil("u3", Instant.now().plusSeconds(30 * 86400));

        scheduler.recordTransitions();

        assertEquals(1, events.findByUserIdOrderByCreatedAtAscIdAsc("u3").size());
    }

    @Test
    void reconciliationReportsNoDriftOnHealthyData()
    {
        activateUntil("u4", Instant.now().plusSeconds(86400));

        assertEquals(0, scheduler.reconcile());
    }

    @Test
    void reconciliationDetectsAtamperedProjection()
    {
        activateUntil("u5", Instant.now().plusSeconds(86400));

        Subscription tampered = projections.findById("u5").orElseThrow();
        tampered.setTier(Tier.CORPORATE);
        projections.save(tampered);

        assertEquals(1, scheduler.reconcile());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=BillingSchedulerTest`
Expected: FAIL — `BillingScheduler` does not exist.

- [ ] **Step 3: Write the scheduler**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.time.Clock;
import java.util.List;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/**
 * The daily job. Nothing here grants access — the projection's dates had already decided
 * that before this ran. Its jobs are to make the history read correctly, to notify, and to
 * prove the projection still agrees with the log.
 */
@Component
@RequiredArgsConstructor
class BillingScheduler
{
    private static final Logger log = LoggerFactory.getLogger(BillingScheduler.class);

    private static final List<SubscriptionStatus> LIVE = List.of(
            SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE,
            SubscriptionStatus.CANCELLED, SubscriptionStatus.GRACE);

    private final SubscriptionRepository subscriptions;

    private final BillingEventRepository events;

    private final SubscriptionProjector projector;

    private final AccessResolver resolver;

    private final Clock clock;

    @Scheduled(cron = "${billing.job-cron:0 15 2 * * *}")
    public void run()
    {
        recordTransitions();
        long drift = reconcile();
        if (drift > 0)
        {
            log.error("{} subscription rows disagree with their event log", drift);
        }
    }

    /**
     * Writes the {@code GRACE_STARTED} / {@code LAPSED} events for subscriptions whose
     * effective status has moved past their stored one. Each transition is written once:
     * the check is whether an event of that type already exists after the current period.
     */
    @Transactional
    void recordTransitions()
    {
        for (Subscription subscription : subscriptions.findByStatusIn(LIVE))
        {
            SubscriptionStatus effective = resolver.resolve(subscription).status();
            if (effective == subscription.getStatus() || effective == SubscriptionStatus.ACTIVE
                    || effective == SubscriptionStatus.TRIALING)
            {
                continue;
            }

            BillingEventType type = effective == SubscriptionStatus.GRACE
                    ? BillingEventType.GRACE_STARTED
                    : BillingEventType.LAPSED;

            if (alreadyRecorded(subscription, type))
            {
                continue;
            }

            events.save(BillingEvent.builder()
                    .userId(subscription.getUserId())
                    .type(type)
                    .tier(subscription.getTier())
                    .actor(BillingActor.SYSTEM)
                    .createdAt(clock.instant())
                    .note("recorded by the daily billing job")
                    .build());

            log.info("user {} moved to {}", subscription.getUserId(), effective);
        }
    }

    /**
     * A transition belongs to the current period, so an event of this type written after the
     * period ended means it has already been recorded. A renewal moves {@code periodEnd}
     * forward and the next lapse is recorded again.
     */
    private boolean alreadyRecorded(Subscription subscription, BillingEventType type)
    {
        return events.findByUserIdOrderByCreatedAtAscIdAsc(subscription.getUserId()).stream()
                .anyMatch(e -> e.getType() == type
                        && subscription.getCurrentPeriodEnd() != null
                        && e.getCreatedAt().isAfter(subscription.getCurrentPeriodEnd()));
    }

    /**
     * Re-derives every projection from its log and counts the disagreements. Without this,
     * "the projection is reproducible from the event log" is a claim rather than a fact.
     *
     * @return the number of rows that drifted
     */
    @Transactional(readOnly = true)
    long reconcile()
    {
        long drift = 0;
        for (Subscription stored : subscriptions.findAll())
        {
            Subscription expected = projector.project(
                    stored.getUserId(),
                    events.findByUserIdOrderByCreatedAtAscIdAsc(stored.getUserId()),
                    stored.getUpdatedAt());

            if (!Objects.equals(stored.getTier(), expected.getTier())
                    || !Objects.equals(stored.getStatus(), expected.getStatus())
                    || !Objects.equals(stored.getCurrentPeriodEnd(), expected.getCurrentPeriodEnd())
                    || !Objects.equals(stored.getGraceUntil(), expected.getGraceUntil()))
            {
                drift++;
                log.error("subscription {} drifted from its log: stored tier={} status={} end={},"
                                + " log says tier={} status={} end={}",
                        stored.getUserId(), stored.getTier(), stored.getStatus(), stored.getCurrentPeriodEnd(),
                        expected.getTier(), expected.getStatus(), expected.getCurrentPeriodEnd());
            }
        }
        return drift;
    }
}
```

- [ ] **Step 4: Enable scheduling**

On `HisaabkitaabApplication`, add `@EnableScheduling` and
`import org.springframework.scheduling.annotation.EnableScheduling;`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=BillingSchedulerTest`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/BillingScheduler.java \
        src/backend/src/main/java/io/github/baeyung/hisaabkitaab/HisaabkitaabApplication.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/BillingSchedulerTest.java
git commit -m "feat(billing): daily transition, notification and reconciliation job"
```

---

### Task 13: Rollout backfill and full verification

**Files:**
- Create: `billing/TrialBackfill.java`
- Test: `src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/TrialBackfillTest.java`

**Interfaces:**
- Consumes: `Subscriptions`, `SubscriptionRepository`, a JDBC query for verified users.
- Produces: `TrialBackfill.backfill()` returning the number of trials granted.

**Note on the boundary:** the backfill must find verified users, which lives in `users`. Rather than import `UserRepository` — which would breach the no-application-types rule — it reads ids through `JdbcTemplate`. That keeps the package free of compile-time dependencies on the application's entities.

- [ ] **Step 1: Write the failing test**

```java
package io.github.baeyung.hisaabkitaab.billing;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "billing.enforcement=true")
@Transactional
class TrialBackfillTest
{
    @Autowired
    private TrialBackfill backfill;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private SubscriptionRepository subscriptions;

    private void insertUser(String id, boolean verified)
    {
        jdbc.update("INSERT INTO users (id, contact_number, password_hash, name, verified,"
                        + " verification_attempts, failed_login_attempts, reset_attempts)"
                        + " VALUES (?, ?, 'x', 'Name', ?, 0, 0, 0)",
                id, "0300" + id, verified);
    }

    @Test
    void averifiedUserWithNoSubscriptionGetsATrial()
    {
        insertUser("legacy1", true);

        assertEquals(1, backfill.backfill());
        assertEquals(SubscriptionStatus.TRIALING, subscriptions.findById("legacy1").orElseThrow().getStatus());
    }

    @Test
    void anUnverifiedUserIsSkipped()
    {
        insertUser("legacy2", false);

        assertEquals(0, backfill.backfill());
        assertTrue(subscriptions.findById("legacy2").isEmpty());
    }

    @Test
    void runningTwiceGrantsNothingTheSecondTime()
    {
        insertUser("legacy3", true);

        assertEquals(1, backfill.backfill());
        assertEquals(0, backfill.backfill());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && ./mvnw test -Dtest=TrialBackfillTest`
Expected: FAIL — `TrialBackfill` does not exist.

- [ ] **Step 3: Write the backfill**

```java
package io.github.baeyung.hisaabkitaab.billing;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Gives every account that existed before billing shipped a trial dated from the rollout,
 * rather than leaving them locked out by a system they never agreed to.
 *
 * <p>Reads user ids through JDBC rather than {@code UserRepository} on purpose: this package
 * must not acquire a compile-time dependency on the application's entities, because that is
 * what would have to be unpicked to extract it into a service.
 *
 * <p>Idempotent — {@code StartTrial} is a no-op for anyone with billing history — so it is
 * safe on every boot and needs no "has this run" flag.
 */
@Component
@RequiredArgsConstructor
class TrialBackfill
{
    private static final Logger log = LoggerFactory.getLogger(TrialBackfill.class);

    private final JdbcTemplate jdbc;

    private final Subscriptions subscriptions;

    private final SubscriptionRepository projections;

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup()
    {
        int granted = backfill();
        if (granted > 0)
        {
            log.warn("granted a rollout trial to {} pre-existing verified accounts", granted);
        }
    }

    int backfill()
    {
        List<String> verified = jdbc.queryForList(
                "SELECT id FROM users WHERE verified = TRUE", String.class);

        int granted = 0;
        for (String userId : verified)
        {
            if (projections.findById(userId).isPresent())
            {
                continue;
            }
            subscriptions.apply(new BillingCommand.StartTrial(userId));
            granted++;
        }
        return granted;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && ./mvnw test -Dtest=TrialBackfillTest`
Expected: PASS, 3 tests. If the `INSERT` fails on a missing column, add the missing `NOT NULL` columns from `User` to the statement — read the entity rather than guessing.

- [ ] **Step 5: Run the entire suite**

Run: `cd src/backend && ./mvnw test`
Expected: PASS. Every pre-existing test must still pass — `billing.enforcement` defaults to `false`, so nothing outside the billing tests changes behaviour.

- [ ] **Step 6: Verify against a real Postgres**

Start the database and boot the app:

```bash
cd "$(git rev-parse --show-toplevel)" && docker compose up -d
cd src/backend && ./mvnw spring-boot:run
```

Confirm in the log that `BillingIndexInitializer` ran without error, then check the schema:

```bash
psql -h localhost -U hkadmin -d hisaabkitaab -c "\d billing_events"
psql -h localhost -U hkadmin -d hisaabkitaab -c "\d subscriptions"
```

Expected: `billing_events_provider_ref_uk` present as a partial unique index; CHECK constraints present on `billing_events.type`, `billing_events.tier`, `billing_events.actor`, `subscriptions.tier`, `subscriptions.status`.

- [ ] **Step 7: Commit**

```bash
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/billing/TrialBackfill.java \
        src/backend/src/test/java/io/github/baeyung/hisaabkitaab/billing/TrialBackfillTest.java
git commit -m "feat(billing): grant rollout trials to pre-existing verified accounts"
```

---

## Acceptance criteria

Check each against the running application before calling this done:

- [ ] A verified user has a `TRIALING` subscription on `PREMIUM`, 30 days from verification, with exactly one `TRIAL_STARTED` event.
- [ ] A user past `currentPeriodEnd` and past `graceUntil` receives 402 on `POST /api/parties`, with `tier` and `status` in the `billing` block of the body.
- [ ] That same user can read every screen, delete records, edit store settings, and call `POST /api/transactions/bills/details`.
- [ ] `PUT /api/stores/opening-cash` returns 402 for that user while `PUT /api/stores/{id}` returns 200.
- [ ] Applying the same `Activate` command twice produces one event and one state.
- [ ] Five consecutive `PaymentFailed` commands leave `graceUntil` unchanged.
- [ ] Setting `billing.enforcement=false` restores full write access to a lapsed user with no code change.
- [ ] `BillingScheduler.reconcile()` returns 0 on healthy data.
- [ ] `mvnw test` passes in full.

## Out of scope

- **Payment provider integration.** The seam is `Subscriptions.apply()`. Once the provider is known, the webhook is one class: verify signature, map payload to a command, call `apply`. No `PaymentProvider` interface is introduced before that API is seen.
- **Usage counters for metered quotas.** `limit()` returns a number; only `stores` is enforced, via a count. A counter table arrives with the first metered feature.
- **Reminder emails at T-7/T-3/T-1.** The scheduler has the hook point in `recordTransitions()`; wiring the existing mail service is a follow-up, and outgoing mail is currently disabled by `app.email.enabled` anyway.
- **Frontend upgrade prompts.** `GET /api/billing/me` and the 402 body carry everything the SPA needs.
