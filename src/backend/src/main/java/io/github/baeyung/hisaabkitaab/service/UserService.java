package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.entity.User;

public interface UserService
{
    User create(SignupRequest request);
}
