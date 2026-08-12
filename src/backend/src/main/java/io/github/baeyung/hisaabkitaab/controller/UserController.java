package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.user.ProfileRequest;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in account itself, outside any shop — the id comes from the credentials, never
 * from the caller, so this is only ever self-service whatever role the user holds anywhere.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController
{
    private final UserService userService;

    @PutMapping("/me")
    public ResponseEntity<User> updateMe(@Valid @RequestBody ProfileRequest request,
            @AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(userService.updateProfile(principal.getUser().getId(), request));
    }
}
