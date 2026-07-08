package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.user.UserRequest;
import io.github.baeyung.hisaabkitaab.dto.user.UserResponse;

public interface UserService
{
    UserResponse create(UserRequest request);

    UserResponse getById(String id);

    List<UserResponse> getAll();

    UserResponse update(String id, UserRequest request);

    void delete(String id);
}
