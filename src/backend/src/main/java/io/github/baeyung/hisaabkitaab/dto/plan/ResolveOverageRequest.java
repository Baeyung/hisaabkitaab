package io.github.baeyung.hisaabkitaab.dto.plan;

import java.util.List;

import jakarta.validation.constraints.NotNull;

/**
 * Which shops the owner is keeping open. States the whole set rather than naming the ones to
 * close, for the same reason an admin's plan assignment states the whole plan: the choice is
 * settled in one call, so a shop left out of a previous round cannot linger closed once there
 * is room for it again.
 *
 * <p>An empty list is legitimate — an owner may close everything and come back to it.
 */
public record ResolveOverageRequest(@NotNull List<String> keepStoreIds)
{
}
