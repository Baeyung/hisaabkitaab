package io.github.baeyung.hisaabkitaab.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.plan.AdminUserResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.AssignPlanRequest;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanResponse;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.UserPlanRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/**
 * What each account is entitled to, and the admin's view over it.
 *
 * <p>Nothing here enforces anything yet — there is no payment provider, so a plan is currently
 * a record of what an account has been <em>sold</em>, not a gate. The enforcement points are
 * known ({@code StoreServiceImpl.create} for stores, {@code StoreMemberService.invite} for
 * users) and both already run with the owner as the caller; when they start asking, they ask
 * through the store's owner, never through whoever is logged in.
 *
 * <p>Plans are recorded unconditionally — every signup gets its trial row whether or not the
 * feature is switched on — but a trial's clock does not start until it can be enforced. A
 * fresh trial has a null {@code expiresAt}, and the date is stamped the first time enforcement
 * asks about the account, giving it {@code TRIAL_LENGTH} from that moment. Everything used
 * before then is on us: the product was unlimited in practice, and charging someone for a
 * trial they never knew was running would be dishonest.
 *
 * <p>{@code app.plans.enabled} therefore gates <em>enforcement</em>, not bookkeeping. Nothing
 * reads it yet; the first reader will be whatever starts the clock.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PlanService
{
    /** How long a trial runs once its clock starts. Unread until enforcement starts it. */
    static final Period TRIAL_LENGTH = Period.ofDays(15);

    private final UserPlanRepository userPlanRepository;

    private final UserRepository userRepository;

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
