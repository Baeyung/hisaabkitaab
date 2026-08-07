package io.github.baeyung.hisaabkitaab.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.plan.OverageResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanStatusResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.ResolveOverageRequest;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.PlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * The signed-in user's own plan. The plan itself is read-only here on purpose — what an
 * account is entitled to is changed from the back office ({@code AdminController}) and
 * nowhere else. The one write is {@link #resolveOverage}, which settles which of the user's
 * own shops are living inside the entitlement rather than changing the entitlement.
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

    /**
     * The shops and people behind an account that is over its plan, for the screen where the
     * owner decides what to keep. Readable at any time, not only while over — the same screen
     * is how a shop closed earlier gets re-opened once a bigger plan leaves room.
     */
    @GetMapping("/overage")
    public ResponseEntity<OverageResponse> overage(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(planService.overageOf(principal.getId()));
    }

    /**
     * Settles which shops stay open. The one write on this controller, and it changes no
     * plan: what an account is entitled to is still the back office's to say, and this only
     * decides which of the caller's own shops are living within it.
     */
    @PutMapping("/overage")
    public ResponseEntity<PlanStatusResponse> resolveOverage(
            @Valid @RequestBody ResolveOverageRequest request,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(planService.resolveOverage(principal.getId(), request.keepStoreIds()));
    }
}
