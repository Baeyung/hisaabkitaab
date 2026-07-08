package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.user.UserRequest;
import io.github.baeyung.hisaabkitaab.dto.user.UserResponse;
import io.github.baeyung.hisaabkitaab.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController
{
    private final UserService userService;

    @PostMapping
    public ResponseEntity<UserResponse> create(@Valid @RequestBody UserRequest request)
    {
        UserResponse response = userService.create(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public UserResponse getById(@PathVariable String id)
    {
        return userService.getById(id);
    }

    @GetMapping
    public List<UserResponse> getAll()
    {
        return userService.getAll();
    }

    @PutMapping("/{id}")
    public UserResponse update(@PathVariable String id, @Valid @RequestBody UserRequest request)
    {
        return userService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id)
    {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
