package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.plan.AdminUserResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.AssignPlanRequest;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanResponse;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanTierResponse;
import io.github.baeyung.hisaabkitaab.dto.whatsapp.AdminBlockResponse;
import io.github.baeyung.hisaabkitaab.service.PlanService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.WhatsAppOptOutService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * The back office, served to the separate {@code admin} Angular app. Until there is a payment
 * provider, assigning a plan by hand here is the only way an account gets one.
 *
 * <p>Access is {@code ROLE_ADMIN}, granted by {@code SecurityConfig} to the whole
 * {@code /api/admin/**} namespace — see {@code UserPrincipal} for who holds it. No method here
 * re-checks, exactly as the store controllers lean on {@code @CurrentStore}.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController
{
    private final PlanService planService;

    private final WhatsAppOptOutService optOutService;

    /** Every account and the plan it is on, optionally narrowed by name, email or number. */
    @GetMapping("/users")
    public ResponseEntity<List<AdminUserResponse>> users(
            @RequestParam(required = false) String q)
    {
        return ResponseEntity.ok(planService.usersWithPlans(q));
    }

    @PutMapping("/users/{userId}/plan")
    public ResponseEntity<PlanResponse> assignPlan(@PathVariable String userId,
            @Valid @RequestBody AssignPlanRequest request)
    {
        return ResponseEntity.ok(planService.assign(userId, request));
    }

    /** What each tier grants by default, so the UI can label an override as one. */
    @GetMapping("/plan-tiers")
    public ResponseEntity<List<PlanTierResponse>> planTiers()
    {
        return ResponseEntity.ok(PlanTierResponse.all());
    }

    /**
     * Everyone who has opted out of a shop's WhatsApp messages. Unfiltered — the opt-out page
     * tells people it cannot be undone except by asking us, so this list is the size of how
     * often that is asked. It gets a query parameter when it stops fitting on a screen.
     */
    @GetMapping("/whatsapp-blocks")
    public ResponseEntity<List<AdminBlockResponse>> whatsappBlocks()
    {
        return ResponseEntity.ok(optOutService.all());
    }

    /**
     * Puts someone back on. The only unblock there is: the page a customer confirms on says
     * plainly that undoing it means asking us, and this is us.
     */
    @DeleteMapping("/whatsapp-blocks/{blockId}")
    public ResponseEntity<Void> unblock(@PathVariable String blockId)
    {
        optOutService.unblock(blockId);
        return ResponseEntity.noContent().build();
    }
}
