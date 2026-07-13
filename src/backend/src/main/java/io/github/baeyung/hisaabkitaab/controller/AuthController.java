package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.dto.user.UserRequest;
import io.github.baeyung.hisaabkitaab.dto.user.UserResponse;
import io.github.baeyung.hisaabkitaab.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<UserResponse> signup(@Valid @RequestBody SignupRequest request)
    {
        UserRequest userRequest = new UserRequest();
        userRequest.setName(request.getName());
        userRequest.setContactNumber(request.getContactNumber());
        userRequest.setEmail(request.getEmail());
        userRequest.setPassword(request.getPassword());

        UserResponse response = userService.create(userRequest);
        return ResponseEntity.ok(response);
    }
}
