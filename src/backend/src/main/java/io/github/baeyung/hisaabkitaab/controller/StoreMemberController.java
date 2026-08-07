package io.github.baeyung.hisaabkitaab.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.baeyung.hisaabkitaab.dto.member.InviteRequest;
import io.github.baeyung.hisaabkitaab.dto.member.MemberResponse;
import io.github.baeyung.hisaabkitaab.dto.member.RoleRequest;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.StoreMemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Store Settings › Manage Users. Owner-only throughout — {@code @CurrentStore} defaults to
 * {@code OWNER}, so a shared user cannot even read the list, let alone change who is on it.
 */
@RestController
@RequestMapping("/api/stores/{storeId}/members")
@RequiredArgsConstructor
public class StoreMemberController
{
    private final StoreMemberService storeMemberService;

    @GetMapping
    public ResponseEntity<List<MemberResponse>> list(@CurrentStore Store store)
    {
        return ResponseEntity.ok(storeMemberService.list(store.getId()));
    }

    @PostMapping
    public ResponseEntity<MemberResponse> invite(@Valid @RequestBody InviteRequest request,
            @CurrentStore Store store, @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(storeMemberService.invite(
                store, request.email(), request.role(), principal.getUser().getName()));
    }

    @PutMapping("/{userId}")
    public ResponseEntity<MemberResponse> changeRole(@PathVariable String userId,
            @Valid @RequestBody RoleRequest request, @CurrentStore Store store)
    {
        return ResponseEntity.ok(storeMemberService.changeRole(store.getId(), userId, request.role()));
    }

    /**
     * Allowed on a closed shop: taking a seat back is one of the two ways out of being over
     * the plan's ceilings, so the check that state produces must not also block it.
     */
    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> remove(@PathVariable String userId,
            @CurrentStore(allowLocked = true) Store store)
    {
        storeMemberService.remove(store.getId(), userId);
        return ResponseEntity.noContent().build();
    }
}
