package io.github.baeyung.hisaabkitaab.service;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Party;

/**
 * Builds a human-readable description for a transaction whose entry left the
 * description blank, from data already on the request — e.g.
 * "Sold Lawn Print × 12 to Ahsan Cloth House" or "Received Rs 5,000 from Rana".
 * Pure formatting: no repository or service dependencies.
 */
@Component
public class TransactionDescriptionGenerator
{
    public String generate(EventRequest request, Party party)
    {
        String partyName = partyName(request, party);
        return switch (request.getTransactionEvent())
        {
            case SALE -> withParty("Sold " + itemSummary(request), "to", partyName);
            case PURCHASE -> withParty("Purchased " + itemSummary(request), "from", partyName);
            case RECEIPT -> withParty("Received " + money(request.getCashAmount()), "from", partyName);
            case PAYMENT -> withParty("Paid " + money(request.getCashAmount()), "to", partyName);
            case EXPENSE -> "Expense of " + money(request.getCashAmount());
            case ADJUSTMENT -> "Adjustment of " + money(request.getCashAmount());
            case OPENING_BALANCE -> withParty("Opening balance", "for", partyName);
            case OPENING_STOCK -> "Opening stock " + itemSummary(request);
            case OPENING_CASH -> "Opening drawer balance";
        };
    }

    private String partyName(EventRequest request, Party party)
    {
        if (party != null && StringUtils.hasText(party.getName()))
        {
            return party.getName();
        }
        if (request.getParty() != null && StringUtils.hasText(request.getParty().getName()))
        {
            return request.getParty().getName();
        }
        return null;
    }

    private String withParty(String base, String preposition, String partyName)
    {
        return partyName == null ? base : base + " " + preposition + " " + partyName;
    }

    /**
     * One item → "Lawn Print × 12"; several → "Lawn Print, Voile and 2 more";
     * none (defensive — goods entries always carry items) → "goods".
     */
    private String itemSummary(EventRequest request)
    {
        List<EventRequest.Item> items = request.getItems();
        if (CollectionUtils.isEmpty(items))
        {
            return "goods";
        }
        if (items.size() == 1)
        {
            EventRequest.Item item = items.getFirst();
            String name = StringUtils.hasText(item.getName()) ? item.getName() : "item";
            return item.getQuantity() == null
                    ? name
                    : name + " × " + item.getQuantity().stripTrailingZeros().toPlainString();
        }
        String firstTwo = items.stream()
                .limit(2)
                .map(i -> StringUtils.hasText(i.getName()) ? i.getName() : "item")
                .reduce((a, b) -> a + ", " + b)
                .orElse("items");
        int more = items.size() - 2;
        return more > 0 ? firstTwo + " and " + more + " more" : firstTwo;
    }

    private String money(Double amount)
    {
        return String.format(Locale.US, "Rs %,.0f", amount == null ? 0.0 : amount);
    }
}
