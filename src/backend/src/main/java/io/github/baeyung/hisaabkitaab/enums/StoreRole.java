package io.github.baeyung.hisaabkitaab.enums;

/**
 * What a user is allowed to do inside one store, weakest first — {@link #atLeast} compares
 * by declaration order, so anything added later has to keep that ordering.
 *
 * <p>Only {@link #VIEWER} and {@link #EDITOR} are ever stored, in {@code user_access_store}.
 * {@link #OWNER} is derived from {@code stores.owner_user_id} and belongs to exactly one
 * user, which is why it has no row of its own: ownership is not something that can be
 * granted, only the two lesser roles are.
 */
public enum StoreRole
{
    /** Reads everything in the store, writes nothing. */
    VIEWER,

    /**
     * The day-to-day worker: books entries, adds items and parties, sets opening balances.
     * Cannot erase history beyond {@code Transaction.DELETE_WINDOW}, and cannot touch the
     * store itself — its settings, its user list, or its existence.
     */
    EDITOR,

    /** The shop's creator. Everything, including the destructive and irreversible parts. */
    OWNER;

    /** Whether this role carries at least the rights of {@code required}. */
    public boolean atLeast(StoreRole required)
    {
        return ordinal() >= required.ordinal();
    }
}
