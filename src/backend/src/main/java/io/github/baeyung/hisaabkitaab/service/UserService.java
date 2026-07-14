package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.dto.user.UserRequest;
import io.github.baeyung.hisaabkitaab.dto.user.UserResponse;

public interface UserService
{
    UserResponse create(UserRequest request);
}
