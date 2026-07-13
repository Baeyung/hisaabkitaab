package io.github.baeyung.hisaabkitaab.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.User;

@Repository
public interface UserRepository extends JpaRepository<User, String>
{
    Optional<User> findByContactNumber(String contactNumber);

    Optional<User> findByEmail(String email);

    boolean existsByContactNumber(String contactNumber);
}
