package io.github.baeyung.hisaabkitaab.enums;

/**
 * Whether an account belongs to someone who has actually signed up.
 *
 * <p>An {@link #INVITED} row is a placeholder: a shop owner gave access to an email address
 * with no account behind it, so one is created up front to hang the {@code user_access_store}
 * row off. It holds an email and nothing else real — an unusable password and a synthetic
 * contact number, both only there because the columns are NOT NULL — and it can neither log
 * in nor reset a password. Signing up with that address adopts the row in place (see
 * {@code UserServiceImpl.create}), which is what makes the access granted before signup
 * survive it.
 */
public enum UserStatus
{
    INVITED,
    ACTIVE
}
