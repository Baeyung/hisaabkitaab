package io.github.baeyung.hisaabkitaab.admin;

import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.User;

/**
 * A user as the admin panel sees them. Deliberately not the {@link User} entity: nothing
 * about passwords, reset codes or attempt counters belongs on this wire. {@code history} is
 * empty on the list view and filled on the detail view.
 */
public record AdminUserView(
        String id,
        String name,
        String email,
        String contactNumber,
        boolean verified,
        boolean disabled,
        boolean admin,
        List<AccessEventView> history
)
{
    static AdminUserView of(User user, boolean admin, List<AccessEventView> history)
    {
        return new AdminUserView(user.getId(), user.getName(), user.getEmail(), user.getContactNumber(),
                user.isVerified(), user.isDisabled(), admin, history);
    }
}
