package io.github.baeyung.hisaabkitaab.admin;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * @param disabled the state to put the account into — true locks the user out
 * @param reason   optional note for the audit trail; never shown to the user
 */
public record SetAccessRequest(@NotNull Boolean disabled, @Size(max = 500) String reason)
{
}
