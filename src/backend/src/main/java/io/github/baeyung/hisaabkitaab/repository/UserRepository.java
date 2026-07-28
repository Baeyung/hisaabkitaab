package io.github.baeyung.hisaabkitaab.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.User;

@Repository
public interface UserRepository extends JpaRepository<User, String>
{
    Optional<User> findByContactNumber(String contactNumber);

    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByResetToken(String resetToken);

    /**
     * Resolves a login identifier, which may be either a contact number or an email —
     * the two things a user may type as their username.
     */
    default Optional<User> findByIdentifier(String identifier)
    {
        return findByContactNumber(identifier).or(() -> findByEmailIgnoreCase(identifier));
    }

    boolean existsByContactNumber(String contactNumber);

    boolean existsByEmailIgnoreCase(String email);
}
