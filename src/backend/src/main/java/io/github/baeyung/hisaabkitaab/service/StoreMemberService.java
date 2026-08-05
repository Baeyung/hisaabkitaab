package io.github.baeyung.hisaabkitaab.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.member.MemberResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreAccess;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreAccessRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.service.mail.StoreInviteEmailService;
import lombok.RequiredArgsConstructor;

/**
 * Who else may work in a store. Every method here is reached only through
 * {@code @CurrentStore(OWNER)}, so the caller is always the shop's owner and none of this
 * re-checks that.
 *
 * <p>Access is granted against an email address, whether or not anyone has signed up with it
 * yet: an unknown address gets an {@link UserStatus#INVITED} placeholder account to hang the
 * grant off, which signing up later adopts in place. That is what lets an owner share a shop
 * with someone who has never heard of the app, and have it be waiting for them when they join.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class StoreMemberService
{
    private final StoreAccessRepository storeAccessRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final StoreInviteEmailService inviteEmailService;

    @Transactional(readOnly = true)
    public List<MemberResponse> list(String storeId)
    {
        return storeAccessRepository.findByStoreId(storeId).stream()
                .map(MemberResponse::of)
                .toList();
    }

    /**
     * @param inviterName the owner's own name, passed in rather than read off
     *                    {@code store.getOwner()} — that association is lazy and the store
     *                    arrives here detached.
     */
    public MemberResponse invite(Store store, String email, StoreRole role, String inviterName)
    {
        requireGrantable(role);
        String address = normalizeEmail(email);

        User user = userRepository.findByEmailIgnoreCase(address).orElseGet(() -> invitedShell(address));

        if (store.isOwnedBy(user.getId()))
        {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This is your own shop");
        }
        if (storeAccessRepository.findByStoreIdAndUserId(store.getId(), user.getId()).isPresent())
        {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "They already have access to this shop");
        }

        StoreAccess access = storeAccessRepository.save(StoreAccess.builder()
                .store(store)
                .user(user)
                .role(role)
                .build());

        inviteEmailService.sendEmail(address, inviterName, store.getName(), role,
                user.getStatus() == UserStatus.INVITED);

        return MemberResponse.of(access);
    }

    public MemberResponse changeRole(String storeId, String userId, StoreRole role)
    {
        requireGrantable(role);

        StoreAccess access = access(storeId, userId);
        access.setRole(role);
        return MemberResponse.of(storeAccessRepository.save(access));
    }

    /**
     * Take access away. The user's own account is untouched — it may be a real account with
     * shops of its own, and even a leftover {@code INVITED} shell has to survive so signing up
     * on that address still adopts it.
     */
    public void remove(String storeId, String userId)
    {
        storeAccessRepository.delete(access(storeId, userId));
    }

    private StoreAccess access(String storeId, String userId)
    {
        return storeAccessRepository.findByStoreIdAndUserId(storeId, userId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Member", userId));
    }

    /** Ownership is not something that can be handed out — only the two lesser roles are. */
    private static void requireGrantable(StoreRole role)
    {
        if (role == StoreRole.OWNER)
        {
            throw new IllegalArgumentException("A shop has exactly one owner, and it cannot be granted");
        }
    }

    /**
     * A stand-in account for an address nobody has signed up with. The two NOT NULL columns it
     * has no answer for are filled with values that cannot be used: a contact number in a shape
     * the signup form rejects (digits only), so it can never collide with a real one, and a
     * password nobody holds. Together with {@code UserStatus.INVITED} — which login and
     * password reset both refuse — the row is unreachable until it is adopted at signup.
     */
    private User invitedShell(String email)
    {
        return userRepository.save(User.builder()
                .email(email)
                .name(email)
                .contactNumber("invited:" + UUID.randomUUID())
                .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                .status(UserStatus.INVITED)
                .verified(false)
                .build());
    }

    private static String normalizeEmail(String email)
    {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
