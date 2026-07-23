package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.auth.ForgotPasswordRequest;
import io.github.baeyung.hisaabkitaab.dto.auth.ResendVerificationRequest;
import io.github.baeyung.hisaabkitaab.dto.auth.ResetPasswordRequest;
import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import io.github.baeyung.hisaabkitaab.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController
{
    private final UserService userService;

    @PostMapping("/signup")
    public ResponseEntity<User> signup(@Valid @RequestBody SignupRequest request)
    {
        return ResponseEntity.ok(userService.create(request));
    }

    @GetMapping("/me")
    public ResponseEntity<User> me(@AuthenticationPrincipal UserPrincipal principal)
    {
        return ResponseEntity.ok(principal.getUser());
    }

    @PostMapping("/verify/{token}")
    public ResponseEntity<Void> verify(@PathVariable String token)
    {
        return userService.verify(token)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<Void> resendVerification(@Valid @RequestBody ResendVerificationRequest request)
    {
        userService.resendVerification(request.getIdentifier());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request)
    {
        userService.requestPasswordReset(request.getEmail());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request)
    {
        return userService.resetPassword(request.getToken(), request.getPassword())
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
