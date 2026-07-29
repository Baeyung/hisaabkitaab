package io.github.baeyung.hisaabkitaab.admin;

import java.time.Instant;

public record AccessEventView(boolean disabled, String actor, String reason, Instant at)
{
    static AccessEventView of(AccountAccessEvent event)
    {
        return new AccessEventView(event.isDisabled(), event.getActor(), event.getReason(), event.getCreatedAt());
    }
}
