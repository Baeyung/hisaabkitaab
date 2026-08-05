package io.github.baeyung.hisaabkitaab.dto.member;

import io.github.baeyung.hisaabkitaab.entity.StoreAccess;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;

/**
 * One person the owner has given access to. The owner is never in this list — they are the
 * store, not a guest in it.
 *
 * @param name null while the invite is outstanding: an {@code INVITED} row's name column
 *             holds a placeholder, and showing that back would read as a real account.
 */
public record MemberResponse(
        String userId,
        String name,
        String email,
        StoreRole role,
        UserStatus status)
{
    public static MemberResponse of(StoreAccess access)
    {
        User user = access.getUser();
        return new MemberResponse(
                user.getId(),
                user.getStatus() == UserStatus.ACTIVE ? user.getName() : null,
                user.getEmail(),
                access.getRole(),
                user.getStatus());
    }
}
