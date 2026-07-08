package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.user.UserRequest;
import io.github.baeyung.hisaabkitaab.dto.user.UserResponse;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
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

    @Override
    @Transactional(readOnly = true)
    public UserResponse getById(String id)
    {
        return toResponse(findEntity(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserResponse> getAll()
    {
        return userRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Override
    public UserResponse update(String id, UserRequest request)
    {
        User user = findEntity(id);
        user.setContactNumber(request.getContactNumber());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setName(request.getName());
        user.setEmail(request.getEmail());

        return toResponse(userRepository.save(user));
    }

    @Override
    public void delete(String id)
    {
        if (!userRepository.existsById(id))
        {
            throw ResourceNotFoundException.forEntity("User", id);
        }

        userRepository.deleteById(id);
    }

    private User findEntity(String id)
    {
        return userRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("User", id));
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
