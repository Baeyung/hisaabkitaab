package io.github.baeyung.hisaabkitaab.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import io.github.baeyung.hisaabkitaab.entity.User;

@Repository
public interface UserRepository extends JpaRepository<User, String>
{
    Optional<User> findByContactNumber(String contactNumber);

    Optional<User> findByEmailIgnoreCase(String email);

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

    /**
     * Admin user search across the three things an admin would have to hand — a name, an email,
     * a phone number. An empty query matches everyone, since {@code like '%%'} is true of any
     * string; the {@code coalesce} is what keeps that true of a row whose email is null.
     */
    // ponytail: unpaged, so this returns the whole user table. Add a Pageable when the admin
    // list gets long enough to notice.
    @Query("""
            select u from User u
             where lower(coalesce(u.name, '')) like lower(concat('%', :query, '%'))
                or lower(coalesce(u.email, '')) like lower(concat('%', :query, '%'))
                or coalesce(u.contactNumber, '') like concat('%', :query, '%')
             order by u.name
            """)
    List<User> search(@Param("query") String query);

    /**
     * Counts one failed login, unless the same wrong password was already the last one counted.
     * Written as a single conditional UPDATE so the database's row lock does the arbitrating:
     * a burst of parallel requests carrying identical stale credentials serialises here and only
     * the first one lands, while genuinely different guesses each count.
     */
    // Bulk update: it writes past the persistence context, so flush pending state before and
    // clear the now-stale cached entity after — otherwise a later read in the same transaction
    // still shows the old count.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update User u
               set u.failedLoginAttempts = u.failedLoginAttempts + 1,
                   u.lastFailedCredentialHash = :hash
             where u.id = :id
               and (u.lastFailedCredentialHash is null or u.lastFailedCredentialHash <> :hash)
            """)
    void countFailedLogin(@Param("id") String id, @Param("hash") String hash);
}
