package io.github.baeyung.hisaabkitaab.service.impl;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.user.UserRequest;
import io.github.baeyung.hisaabkitaab.dto.user.UserResponse;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.service.UserService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class UserServiceImpl implements UserService
{
    private final UserRepository userRepository;

    private final PasswordEncoder passwordEncoder;

    @Override
    public UserResponse create(UserRequest request)
    {
        User user = User.builder()
                .contactNumber(request.getContactNumber())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .name(request.getName())
                .email(request.getEmail())
                .build();

        return toResponse(userRepository.save(user));
    }

    private UserResponse toResponse(User user)
    {
        return UserResponse.builder()
                .id(user.getId())
                .contactNumber(user.getContactNumber())
                .name(user.getName())
                .email(user.getEmail())
                .build();
    }
}
