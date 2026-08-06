package io.github.baeyung.hisaabkitaab.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.plan.AdminUserResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.AssignPlanRequest;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanLimits;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanStatusResponse;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanCapacity;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;
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
     */
    public PlanResponse assign(String userId, AssignPlanRequest request)
    {
        if (!userRepository.existsById(userId))
        {
            throw ResourceNotFoundException.forEntity("User", userId);
        }

        UserPlan saved = userPlanRepository.save(UserPlan.builder()
                .userId(userId)
                .tier(request.tier())
                .assignedAt(Instant.now())
                .expiresAt(request.expiresAt())
                .maxStores(request.maxStores())
                .maxUsers(request.maxUsers())
                .whatsappQuota(request.whatsappQuota())
                .build());

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
        if (storeAccessRepository.existsByStoreOwnerIdAndUserId(ownerId, memberUserId))
        {
            return;
        }

        requireCapacity(ownerId, PlanCapacity.USERS);
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
                        (int) usageOf(userId, PlanCapacity.USERS)));
    }

    /** What this account has already spent against {@code capacity}, in the limit's own units. */
    private long usageOf(String ownerId, PlanCapacity capacity)
    {
        return switch (capacity)
        {
            case STORES -> storeRepository.countByOwnerId(ownerId);
            // maxUsers counts the owner as well, and they hold no StoreAccess row of their own.
            case USERS -> storeAccessRepository.countDistinctMembersOfStoresOwnedBy(ownerId) + 1;
        };
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
