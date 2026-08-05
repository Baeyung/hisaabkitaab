package io.github.baeyung.hisaabkitaab.dto.plan;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;

/**
 * A row of the admin's user list. Carries only what identifies an account and what plan it is
 * on — never anything from {@link User} that could help impersonate it.
 *
 * @param plan null for an account with no plan row — an {@code INVITED} placeholder nobody has
 *             signed up as yet.
 */
public record AdminUserResponse(
        String id,
        String name,
        String email,
        String contactNumber,
        boolean verified,
        UserStatus status,
        PlanResponse plan)
{
    public static AdminUserResponse of(User user, PlanResponse plan)
    {
        return new AdminUserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getContactNumber(),
                user.isVerified(),
                user.getStatus(),
                plan);
    }
}
