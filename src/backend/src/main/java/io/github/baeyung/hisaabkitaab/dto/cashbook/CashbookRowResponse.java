package io.github.baeyung.hisaabkitaab.dto.cashbook;

import java.time.Instant;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

public record CashbookRowResponse(
        String transactionId,
        Instant occurredAt,
        TransactionEvent event,
        String description,
        /** Goods on the entry ("Lawn Print × 12") — null when it moves none. */
        String itemSummary,
        String partyName,
        InOut inOut,
        double amount,
        /**
         * What the same entry did to the party's khata, so the drawer figure isn't read as
         * the whole story: a 5,000 sale that took 2,000 in cash shows 2,000 here in
         * {@code amount} and 3,000 on the khata, and a receipt shows the cash it brought in
         * against the baqaya it cleared. SETTLED on an entry that touches no party.
         */
        PartyBalance khata,
        /** What a SALE/PURCHASE entry knocked off its bill — 0 on every other event. */
        double discount,
        double runningBalance
)
{
}
