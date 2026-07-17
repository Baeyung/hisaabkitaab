package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TransactionDescriptionGeneratorTest
{
    private final TransactionDescriptionGenerator generator = new TransactionDescriptionGenerator();

    @Test
    void saleWithSingleItemAndParty()
    {
        EventRequest request = request(TransactionEvent.SALE, 5000.0);
        request.setItems(List.of(new EventRequest.Item(null, "Lawn Print", new BigDecimal("12.00"), 400.0)));

        assertEquals(
                "Sold Lawn Print × 12 to Ahsan Cloth House",
                generator.generate(request, party("Ahsan Cloth House"))
        );
    }

    @Test
    void saleWithManyItemsAndNoParty()
    {
        EventRequest request = request(TransactionEvent.SALE, 5000.0);
        request.setItems(List.of(
                new EventRequest.Item(null, "Lawn Print", BigDecimal.ONE, 400.0),
                new EventRequest.Item(null, "Voile", BigDecimal.ONE, 300.0),
                new EventRequest.Item(null, "Cambric", BigDecimal.ONE, 200.0),
                new EventRequest.Item(null, "Chamki", BigDecimal.ONE, 100.0)
        ));

        assertEquals("Sold Lawn Print, Voile and 2 more", generator.generate(request, null));
    }

    @Test
    void saleWithNoItemsFallsBackToGoods()
    {
        EventRequest request = request(TransactionEvent.SALE, 5000.0);

        assertEquals("Sold goods", generator.generate(request, null));
    }

    @Test
    void purchaseUsesRequestPartyNameWhenNoResolvedParty()
    {
        EventRequest request = request(TransactionEvent.PURCHASE, 2000.0);
        request.setParty(new EventRequest.Party(null, "Zaman Textiles"));
        request.setItems(List.of(new EventRequest.Item(null, "Cambric", new BigDecimal("50"), 150.0)));

        assertEquals("Purchased Cambric × 50 from Zaman Textiles", generator.generate(request, null));
    }

    @Test
    void receiptFormatsMoneyWithGrouping()
    {
        EventRequest request = request(TransactionEvent.RECEIPT, 5000.0);

        assertEquals("Received Rs 5,000 from Rana", generator.generate(request, party("Rana")));
    }

    @Test
    void paymentWithoutPartyOmitsPreposition()
    {
        EventRequest request = request(TransactionEvent.PAYMENT, 3000.0);

        assertEquals("Paid Rs 3,000", generator.generate(request, null));
    }

    @Test
    void expenseWithNullAmountIsZero()
    {
        EventRequest request = request(TransactionEvent.EXPENSE, null);

        assertEquals("Expense of Rs 0", generator.generate(request, null));
    }

    private EventRequest request(TransactionEvent event, Double cashAmount)
    {
        EventRequest request = new EventRequest();
        request.setTransactionEvent(event);
        request.setCashAmount(cashAmount);
        return request;
    }

    private Party party(String name)
    {
        return Party.builder().name(name).build();
    }
}
