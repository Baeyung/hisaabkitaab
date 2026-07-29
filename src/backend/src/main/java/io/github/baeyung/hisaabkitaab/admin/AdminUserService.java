package io.github.baeyung.hisaabkitaab.admin;

import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/**
 * The admin panel's view of user accounts, and the one place that flips
 * {@link User#isDisabled()}.
 *
 * <p>Every user is loaded at once: the list feeds a picker, the account count is small, and
 * paging a dropdown nobody scrolls is work for later.
 */
@Service
@RequiredArgsConstructor
public class AdminUserService
{
    private final UserRepository users;

    private final AccountAccessEventRepository events;

    private final AdminAccounts adminAccounts;

    /** Every account, newest access state included, for the picker. No history — see {@link #detail}. */
    @Transactional(readOnly = true)
    public List<AdminUserView> list()
    {
        return users.findAll().stream()
                .sorted(Comparator.comparing(User::getName, String.CASE_INSENSITIVE_ORDER))
                .map(user -> AdminUserView.of(user, adminAccounts.isAdmin(user.getEmail()), List.of()))
                .toList();
    }

    @Transactional(readOnly = true)
    public AdminUserView detail(String userId)
    {
        return view(find(userId));
    }

    /**
     * Locks or unlocks an account and appends the audit row in the same transaction, so the
     * flag and its explanation can never disagree. Re-applying the state the account is
     * already in is a no-op: the history records changes, not clicks.
     */
    @Transactional
    public AdminUserView setAccess(String userId, boolean disabled, String reason, String actorEmail)
    {
        User user = find(userId);

        // An admin who locks an admin — themselves included — locks the panel's own door,
        // and the way back in is a database edit. Config decides who is an admin; the panel
        // does not get to overrule it.
        if (adminAccounts.isAdmin(user.getEmail()))
        {
            throw new IllegalArgumentException("Admin accounts cannot be locked");
        }

        if (user.isDisabled() != disabled)
        {
            user.setDisabled(disabled);
            events.save(new AccountAccessEvent(user.getId(), disabled, actorEmail, blankToNull(reason)));
        }

        return view(user);
    }

    private AdminUserView view(User user)
    {
        List<AccessEventView> history = events.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(AccessEventView::of)
                .toList();

        return AdminUserView.of(user, adminAccounts.isAdmin(user.getEmail()), history);
    }

    private User find(String userId)
    {
        return users.findById(userId).orElseThrow(() -> ResourceNotFoundException.forEntity("User", userId));
    }

    private static String blankToNull(String reason)
    {
        return reason == null || reason.isBlank() ? null : reason.trim();
    }
}
