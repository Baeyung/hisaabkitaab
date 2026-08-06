package io.github.baeyung.hisaabkitaab.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.plan.PlanStatusResponse;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.PlanService;
import lombok.RequiredArgsConstructor;

/**
 * The signed-in user's own plan. Read-only on purpose: a plan is changed from the back office
 * ({@code AdminController}) and nowhere else, so there is nothing here to write to.
 *
 * <p>Separate from {@code /api/admin/**}, which is {@code ROLE_ADMIN} — this is every user's
 * view of their own account, and it always answers about the caller rather than taking a user
 * id, so there is nothing to authorise beyond being signed in.
 */
@RestController
@RequestMapping("/api/plan")
@RequiredArgsConstructor
public class PlanController
{
    private final PlanService planService;

    /** Tier, limits, expiry and what has been used against them — enough to grey a button out. */
    @GetMapping("/me")
    public ResponseEntity<PlanStatusResponse> me(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(planService.statusOf(principal.getId()));
    }
}
