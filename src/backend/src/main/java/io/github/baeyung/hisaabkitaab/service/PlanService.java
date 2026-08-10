package io.github.baeyung.hisaabkitaab.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.YearMonth;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.plan.AdminUserResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.AssignPlanRequest;
import io.github.baeyung.hisaabkitaab.dto.plan.OverageResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanLimits;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanStatusResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanCapacity;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreAccessRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.repository.UserPlanRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/**
 * What each account is entitled to, whether it may still act on it, and the admin's view over
 * it. Every plan question in the application is answered here — the two enforcement points
 * ({@link #isLoginAllowed} at authentication, {@link #requireCapacity} behind
 * {@code @RequiresPlanCapacity}) are the only callers, and neither knows how a limit is worked
 * out.
 *
 * <h2>Two plans, two different questions</h2>
 *
 * <p>A plan hangs off the account that <em>owns</em> shops. That splits enforcement in two, and
 * the split is the whole design:
 *
 * <ul>
 *   <li><b>Getting in</b> ({@link #isLoginAllowed}) accepts a <em>borrowed</em> plan. Someone
 *       whose own trial has lapsed still signs in if any shop shared with them belongs to an
 *       owner who is paid up — they are working inside an account that was paid for, and
 *       shutting them out would be taking a paying customer's staff away from them.
 *   <li><b>Making something new</b> ({@link #requireCapacity}) accepts only the caller's
 *       <em>own</em> plan. The same lapsed user may keep working in the shop they were invited
 *       into, but cannot open a shop of their own or invite anyone into one, because there is
 *       no plan of theirs to charge it to.
 * </ul>
 *
 * <h2>When the trial clock starts</h2>
 *
 * <p>Plans are recorded unconditionally — every signup gets its trial row whether or not the
 * feature is switched on — but a trial's clock does not start until it can be enforced. A fresh
 * trial has a null {@code expiresAt}, and the date is stamped by {@link #startClock} the first
 * time an enforcement path looks at the account <em>with plans switched on</em>, giving it
 * {@link #TRIAL_LENGTH} from that moment. Everything used before then is on us: the product was
 * unlimited in practice, and charging someone for a trial they never knew was running would be
 * dishonest. Since authentication is stateless and re-runs per request, "the first time" in
 * practice means the account's next request after the switch is thrown.
 *
 * <p>{@code app.plans.enabled} therefore gates <em>enforcement</em>, not bookkeeping, and is
 * read in exactly one place — {@link #enabled}, below. Switched off, nothing is refused and no
 * clock is ever stamped, so an account's trial does not quietly burn down while the feature is
 * dark.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PlanService
{
    /**
     * How long a trial runs once its clock starts. A calendar month rather than a fixed number
     * of days, because that is what the product is sold as on the public page — a trial started
     * on the 31st ends on the 28th, and matching the wording beats matching an arithmetic.
     */
    static final Period TRIAL_LENGTH = Period.ofMonths(1);

    private final UserPlanRepository userPlanRepository;

    private final UserRepository userRepository;

    private final StoreRepository storeRepository;

    private final StoreAccessRepository storeAccessRepository;

    /**
     * The one reader of {@code app.plans.enabled} in the application. Off, every check below
     * returns as though the account were unlimited — which is also what a missing property
     * means, deliberately: a configuration gap must not lock a paying customer out.
     */
    @Value("${app.plans.enabled:false}")
    private boolean enabled;

    /**
     * Puts a new account on {@code TRIAL} with no expiry date — the plan exists, its clock does
     * not run yet. Called from signup, which is also where an {@code INVITED} placeholder is
     * adopted, so a placeholder gets its plan when someone actually signs up rather than when a
     * shop owner invited the address months earlier.
     *
     * <p>An account that already has a plan keeps it: signup is reachable for an adopted
     * placeholder, and re-running it must never reset one.
     */
    public void startTrial(User user)
    {
        if (userPlanRepository.existsById(user.getId()))
        {
            return;
        }

        userPlanRepository.save(UserPlan.builder()
                .userId(user.getId())
                .tier(PlanTier.TRIAL)
                .assignedAt(Instant.now())
                .build()
        );
    }

    /**
     * Puts a plan on an account, replacing whatever was there. Overrides left out of the
     * request are cleared rather than kept: an assignment states the whole plan, so moving an
     * account back to a standard tier cannot silently leave a bespoke limit behind.
     *
     * <p>What this month's WhatsApp sends cost is <em>not</em> part of the plan being stated,
     * so it is carried across rather than rebuilt with the rest. An assignment changes what
     * the account is entitled to from here on; it does not un-send the messages already sent,
     * and a re-assignment that refilled the month's quota would be a way to buy the same
     * fifty messages twice.
     */
    public PlanResponse assign(String userId, AssignPlanRequest request)
    {
        if (!userRepository.existsById(userId))
        {
            throw ResourceNotFoundException.forEntity("User", userId);
        }

        UserPlan previous = userPlanRepository.findById(userId).orElse(null);

        UserPlan saved = userPlanRepository.save(UserPlan.builder()
                .userId(userId)
                .tier(request.tier())
                .assignedAt(Instant.now())
                .expiresAt(request.expiresAt())
                .maxStores(request.maxStores())
                .maxUsers(request.maxUsers())
                .whatsappQuota(request.whatsappQuota())
                .whatsappUsed(previous == null ? 0 : previous.getWhatsappUsed())
                .whatsappPeriod(previous == null ? null : previous.getWhatsappPeriod())
                .build());

        reopenWhereRoom(userId, PlanLimits.effectiveFor(saved).maxStores());

        return PlanResponse.of(saved, LocalDate.now());
    }

    /**
     * Whether this account may sign in at all. Consulted by {@code CustomUserDetailsService} and
     * reported through {@code UserPrincipal.isAccountNonExpired()}, so a lapsed account is
     * refused by Spring Security itself rather than by anything that has to remember to ask.
     *
     * <p>Admins are exempt. They are ordinary accounts named in {@code app.admin.emails}, so a
     * lapsed trial on the address that runs the back office would lock the back office — and
     * the back office is where a plan gets renewed. That would leave the configuration switch
     * as the only way back in.
     *
     * <p>An account with a lapsed plan of its own is still let in on the strength of a shop
     * shared with it by a paid-up owner; see this class's javadoc for why that borrowing stops
     * at the door.
     */
    public boolean isLoginAllowed(User user, boolean admin)
    {
        if (!enabled || admin)
        {
            return true;
        }

        LocalDate today = LocalDate.now();

        return isActive(startClock(planOf(user.getId())), today)
                || storeAccessRepository.hasSharedStoreOnActivePlan(user.getId(), today);
    }

    /**
     * Refuses the call unless {@code ownerId}'s own plan is live and has room for one more of
     * {@code capacity}. The single check behind {@code @RequiresPlanCapacity} — see
     * {@code PlanCapacityAspect} for how it is reached, and this class's javadoc for why a
     * borrowed plan buys nothing here.
     *
     * @throws ResponseStatusException 403, carrying a message meant to be shown as-is: the
     *         user needs to know which ceiling they hit, not that a check exists.
     */
    public void requireCapacity(String ownerId, PlanCapacity capacity)
    {
        if (!enabled)
        {
            return;
        }

        LocalDate today = LocalDate.now();
        UserPlan plan = startClock(planOf(ownerId));

        if (!isActive(plan, today))
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Your plan ended on " + plan.getExpiresAt() + ". Renew it to add anything new.");
        }

        int limit = capacity.limitOf(PlanLimits.effectiveFor(plan));

        // ponytail: count-then-act, so two simultaneous requests can both pass and overshoot by
        // one. Not worth a lock for a shopkeeper adding a shop — take a row lock on the plan
        // here if that ever stops being the traffic pattern.
        if (usageOf(ownerId, capacity) >= limit)
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Your plan covers " + capacity.describe(limit) + ". Upgrade to add more.");
        }
    }

    /**
     * Refuses an invite unless the owner's plan has room for this <em>particular</em> person.
     *
     * <p>Called directly by {@code StoreMemberService.invite} rather than declared with
     * {@code @RequiresPlanCapacity}, and that is the one place the declarative route does not
     * reach: {@code maxUsers} counts distinct people, so whether an invite costs a seat depends
     * on <em>who</em> is being invited, and advice that runs before the method has no way to
     * know. Adding an existing member to a second shop costs nothing, and an owner at their
     * ceiling being told to upgrade for a user they already have would be simply wrong.
     *
     * <p>The rule itself still lives here with every other one — only the trigger differs.
     */
    public void requireRoomForMember(String ownerId, String memberUserId)
    {
        if (storeAccessRepository.existsByStoreOwnerIdAndUserIdAndStoreSuspendedAtIsNull(ownerId, memberUserId))
        {
            return;
        }

        requireCapacity(ownerId, PlanCapacity.USERS);
    }

    /**
     * Charges one WhatsApp message to the owner's plan, refusing the send if there is nothing
     * left to charge it to. The only enforcement point for the quota — a send that has not
     * been through here has not been paid for.
     *
     * <p>Unlike the standing capacities this is spent, not occupied, so it is charged
     * <em>before</em> the message goes out and given back by {@link #releaseWhatsappMessage}
     * if it turns out not to have gone. Charging afterwards would leave the ceiling open to
     * anyone willing to fire requests in parallel, which is the whole thing this defends
     * against; see {@code UserPlanRepository.spendWhatsapp} for how the count itself is kept
     * honest.
     *
     * <p>Quota belongs to the account that <em>owns</em> the shop, not to whoever pressed the
     * button — an invited member sending a customer their bill spends the owner's plan, for
     * the same reason they work inside the owner's shop at all.
     *
     * @return the period the message was charged to, to be handed back to
     *         {@link #releaseWhatsappMessage}, or null when plans are switched off and
     *         nothing was charged
     * @throws ResponseStatusException 403, carrying a message meant to be shown as-is
     */
    public String spendWhatsappMessage(String ownerId)
    {
        if (!enabled)
        {
            return null;
        }

        UserPlan plan = startClock(planOf(ownerId));

        if (!isActive(plan, LocalDate.now()))
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Your plan ended on " + plan.getExpiresAt() + ". Renew it to send on WhatsApp.");
        }

        int quota = PlanLimits.effectiveFor(plan).whatsappQuota();

        // Nothing to meter rather than nothing left — a different sentence, because upgrading
        // is the answer to one and waiting for the month to turn is the answer to the other.
        if (quota == 0)
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Sending on WhatsApp is not part of your plan. Upgrade to send bills and "
                            + "statements to your customers.");
        }

        String period = currentPeriod();

        if (userPlanRepository.spendWhatsapp(ownerId, period, quota) == 0)
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You have used all " + quota + " WhatsApp messages your plan covers this month. "
                            + "The count starts again next month, or upgrade for more.");
        }

        return period;
    }

    /**
     * Gives back a message charged by {@link #spendWhatsappMessage} that never actually
     * reached the recipient. Takes the period that call returned and does nothing when it is
     * null, so a caller pairs the two without having to know whether plans are switched on.
     */
    public void releaseWhatsappMessage(String ownerId, String period)
    {
        if (period != null)
        {
            userPlanRepository.refundWhatsapp(ownerId, period);
        }
    }

    /**
     * What the account has spent of its quota this month. A count stamped with any other
     * month is last month's and reads as zero — the same reading the next send will act on
     * when it overwrites the row.
     */
    private static int whatsappUsedThisMonth(UserPlan plan)
    {
        return currentPeriod().equals(plan.getWhatsappPeriod()) ? plan.getWhatsappUsed() : 0;
    }

    /** The calendar month a send is charged to, as {@code "2026-08"}. */
    private static String currentPeriod()
    {
        return YearMonth.now().toString();
    }

    /**
     * The signed-in user's own plan with what they have spent against it, for the screens that
     * would rather grey a button out than let the user find the ceiling by hitting it.
     */
    public PlanStatusResponse statusOf(String userId)
    {
        LocalDate today = LocalDate.now();
        UserPlan plan = planOf(userId);

        if (enabled)
        {
            plan = startClock(plan);
        }

        return new PlanStatusResponse(
                plan.getTier(),
                plan.getExpiresAt(),
                !isActive(plan, today),
                enabled,
                PlanLimits.effectiveFor(plan),
                new PlanStatusResponse.PlanUsage(
                        (int) usageOf(userId, PlanCapacity.STORES),
                        (int) usageOf(userId, PlanCapacity.USERS),
                        whatsappUsedThisMonth(plan)));
    }

    /**
     * The shops and people an over-limit owner is choosing between, with the plan they are
     * choosing against. One call for one screen — see {@link OverageResponse} for why the
     * lists are counted here rather than stitched together by the client.
     */
    @Transactional(readOnly = true)
    public OverageResponse overageOf(String ownerId)
    {
        List<OverageResponse.OverageStore> stores = storeRepository.findByOwnerId(ownerId).stream()
                .map(store -> new OverageResponse.OverageStore(
                        store.getId(), store.getName(), store.getLogoUri(), store.isSuspended()))
                .toList();

        // Grouped by person, not listed per grant: a seat is spent once however many shops
        // someone is in, so a row per grant would misstate what removing them frees up.
        List<OverageResponse.OveragePerson> people = storeAccessRepository.findByStoreOwnerId(ownerId).stream()
                .collect(Collectors.groupingBy(access -> access.getUser().getId(),
                        LinkedHashMap::new, Collectors.toList()))
                .values().stream()
                .map(grants -> {
                    User user = grants.getFirst().getUser();
                    return new OverageResponse.OveragePerson(
                            user.getId(),
                            // Same rule as MemberResponse: an outstanding invite has a
                            // placeholder name, and showing it back would read as a real one.
                            user.getStatus() == UserStatus.ACTIVE ? user.getName() : null,
                            user.getEmail(),
                            grants.stream().map(access -> access.getStore().getId()).toList());
                })
                .toList();

        return new OverageResponse(statusOf(ownerId), stores, people);
    }

    /**
     * Settles which of the owner's shops stay open; every other shop of theirs is closed.
     * The whole set is stated in one call, and only while the account is actually over its
     * plan.
     *
     * <p>That last condition is the whole reason this is not simply an "open and close my
     * shops" endpoint: once settled, an owner on a one-shop plan could close the shop they
     * kept, open another in its place, and work through all of them one at a time. Re-opening
     * a closed shop is what paying for a bigger plan does — see {@link #reopenWhereRoom},
     * which runs on assignment and gives the shops back without anyone visiting a screen.
     *
     * <p>Does not touch people. Removing a member is what it always was — the owner does it
     * on the shop's own user list — and a seat freed that way is picked up by the next count
     * without anything here knowing.
     *
     * @return the plan as it now stands, so the caller sees straight away whether that was
     *         enough or the seat ceiling is still over
     * @throws ResponseStatusException 400 if the list names a shop that is not this owner's,
     *         or keeps more shops than the plan covers; 409 if the account is not over its
     *         plan and so has nothing to settle
     */
    public PlanStatusResponse resolveOverage(String ownerId, List<String> keepStoreIds)
    {
        if (enabled && !isOverLimit(ownerId))
        {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Your shops already fit your plan. Upgrade it to open a closed shop again.");
        }

        List<Store> owned = storeRepository.findByOwnerId(ownerId);
        Set<String> keep = Set.copyOf(keepStoreIds);

        if (!owned.stream().map(Store::getId).collect(Collectors.toSet()).containsAll(keep))
        {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That list names a shop which is not yours.");
        }

        int limit = PlanLimits.effectiveFor(planOf(ownerId)).maxStores();

        if (enabled && keep.size() > limit)
        {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Your plan covers " + PlanCapacity.STORES.describe(limit) + ".");
        }

        Instant now = Instant.now();

        owned.forEach(store -> store.setSuspendedAt(
                keep.contains(store.getId())
                        ? null
                        // Already-closed shops keep the date they were closed on: this call
                        // settles which shops are open, and re-stamping one that never
                        // re-opened would lose when it actually happened.
                        : store.isSuspended() ? store.getSuspendedAt() : now));

        storeRepository.saveAll(owned);

        return statusOf(ownerId);
    }

    /**
     * Re-opens closed shops while the plan has room for them, most recently closed first —
     * the reverse of the order an owner gave them up in. Called after an assignment, so a
     * customer who pays for a bigger plan gets their shops back by paying rather than by
     * finding a screen; a plan that got no bigger re-opens nothing.
     */
    private void reopenWhereRoom(String ownerId, int maxStores)
    {
        long open = storeRepository.countByOwnerIdAndSuspendedAtIsNull(ownerId);

        if (open >= maxStores)
        {
            return;
        }

        List<Store> reopened = storeRepository.findByOwnerId(ownerId).stream()
                .filter(Store::isSuspended)
                .sorted(Comparator.comparing(Store::getSuspendedAt).reversed())
                .limit(maxStores - open)
                .toList();

        reopened.forEach(store -> store.setSuspendedAt(null));
        storeRepository.saveAll(reopened);
    }

    /**
     * What this account has already spent against {@code capacity}, in the limit's own units.
     * Suspended shops are outside both counts — see {@code Store.suspendedAt} for why.
     */
    private long usageOf(String ownerId, PlanCapacity capacity)
    {
        return switch (capacity)
        {
            case STORES -> storeRepository.countByOwnerIdAndSuspendedAtIsNull(ownerId);
            // maxUsers counts the owner as well, and they hold no StoreAccess row of their own.
            case USERS -> storeAccessRepository.countDistinctMembersOfStoresOwnedBy(ownerId) + 1;
        };
    }

    /**
     * Whether this account is using more than its plan covers — which is not the same as
     * being <em>at</em> its ceiling. {@link #requireCapacity} refuses the next thing at the
     * limit; this is the state after a downgrade has already put the account past one, and
     * it is the only thing an owner is made to resolve before working again.
     *
     * <p>Reachable only by an admin dropping a tier or tightening an override: nothing a user
     * can do to their own account gets them here, because every path that adds is refused at
     * the ceiling.
     */
    public boolean isOverLimit(String ownerId)
    {
        if (!enabled)
        {
            return false;
        }

        PlanLimits limits = PlanLimits.effectiveFor(planOf(ownerId));

        return usageOf(ownerId, PlanCapacity.STORES) > limits.maxStores()
                || usageOf(ownerId, PlanCapacity.USERS) > limits.maxUsers();
    }

    /**
     * Refuses a write into a shop the plan does not currently cover. Called from
     * {@code CurrentStoreArgumentResolver} for every non-{@code GET} request, which is what
     * makes this un-forgettable on a new endpoint the way {@code @CurrentStore} itself is —
     * and why reads are never touched: a shop the plan has closed stays readable, printable
     * and exportable, because a plan lapsing is a billing state and not grounds to take
     * somebody's books away.
     *
     * <p>Two refusals, one for each half of {@code Store.suspendedAt}'s meaning: the shop is
     * closed, or the account is past a ceiling and has not yet said which shops it is keeping.
     *
     * @throws ResponseStatusException 403, carrying a message meant to be shown as-is.
     */
    public void requireWritable(Store store)
    {
        if (!enabled)
        {
            return;
        }

        if (store.isSuspended())
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This shop is closed because your plan no longer covers it. "
                            + "Upgrade to open it again — nothing in it has been lost.");
        }

        // ponytail: three extra queries on every write, and only the first is short-circuited
        // by the check above. Fine at a shopkeeper's request rate — cache the answer per
        // request (a request-scoped bean, or an attribute on the request) if it ever isn't.
        if (isOverLimit(store.getOwner().getId()))
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This account is using more than its plan covers. "
                            + "Choose which shops to keep open before adding anything new.");
        }
    }

    /**
     * This account's plan, creating the trial row if it is somehow missing. Self-healing rather
     * than throwing: the only ways to have no row are a pre-migration account or a signup whose
     * {@link #startTrial} failed, and neither is the user's fault — refusing them service over
     * our own gap would be the wrong way round.
     */
    private UserPlan planOf(String userId)
    {
        return userPlanRepository.findById(userId).orElseGet(() -> userPlanRepository.save(
                UserPlan.builder()
                        .userId(userId)
                        .tier(PlanTier.TRIAL)
                        .assignedAt(Instant.now())
                        .build()));
    }

    /**
     * Stamps a not-yet-started plan with its expiry, {@link #TRIAL_LENGTH} from today. Only ever
     * called with plans switched on, which is what keeps a dark feature from spending anybody's
     * trial. A plan that already has a date is returned untouched, so this writes once per
     * account however often it is called.
     */
    private UserPlan startClock(UserPlan plan)
    {
        if (plan.getExpiresAt() != null)
        {
            return plan;
        }

        plan.setExpiresAt(LocalDate.now().plus(TRIAL_LENGTH));

        return userPlanRepository.save(plan);
    }

    /** A plan is good through the whole of its last day; a clock not yet started has not run out. */
    private static boolean isActive(UserPlan plan, LocalDate today)
    {
        return plan.getExpiresAt() == null || !plan.getExpiresAt().isBefore(today);
    }

    /** The admin user list, each row carrying its plan. An empty query matches everyone. */
    @Transactional(readOnly = true)
    public List<AdminUserResponse> usersWithPlans(String query)
    {
        List<User> users = userRepository.search(query == null ? "" : query.trim());

        Map<String, PlanResponse> plans = plansOf(users.stream().map(User::getId).toList());

        return users.stream()
                .map(user -> AdminUserResponse.of(user, plans.get(user.getId())))
                .toList();
    }

    /** Plans for a set of accounts in one query. Accounts with no plan are simply absent. */
    @Transactional(readOnly = true)
    public Map<String, PlanResponse> plansOf(Collection<String> userIds)
    {
        LocalDate today = LocalDate.now();

        return userPlanRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(UserPlan::getUserId, plan -> PlanResponse.of(plan, today)));
    }
}
