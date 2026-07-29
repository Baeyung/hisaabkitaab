package io.github.baeyung.hisaabkitaab.admin;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * The admin app's API. Reachable only with {@code ROLE_ADMIN}, which
 * {@code CustomUserDetailsService} grants to a verified account whose email is listed in
 * {@code app.admin.emails} — everyone else is refused by {@code SecurityConfig} before
 * reaching this class, so there is no per-method check here.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController
{
    private final AdminUserService adminUserService;

    /** Every account, for the user picker. Doubles as the admin app's login check. */
    @GetMapping("/users")
    public ResponseEntity<List<AdminUserView>> list()
    {
        return ResponseEntity.ok(adminUserService.list());
    }

    /** One account with its full lock/unlock history. */
    @GetMapping("/users/{id}")
    public ResponseEntity<AdminUserView> get(@PathVariable String id)
    {
        return ResponseEntity.ok(adminUserService.detail(id));
    }

    /** Locks or unlocks the account; returns it with the history the change just extended. */
    @PutMapping("/users/{id}/access")
    public ResponseEntity<AdminUserView> setAccess(@PathVariable String id,
            @Valid @RequestBody SetAccessRequest request,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(adminUserService.setAccess(id, request.disabled(), request.reason(),
                principal.getUsername()));
    }
}
