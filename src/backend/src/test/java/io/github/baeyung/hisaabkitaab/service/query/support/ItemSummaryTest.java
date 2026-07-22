package io.github.baeyung.hisaabkitaab.service.query.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.Arrays;

import org.junit.jupiter.api.Test;

import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;

class ItemSummaryTest
{
    @Test
    void namesOneItemWithItsQuantity()
    {
        assertThat(ItemSummary.of(sale(stock("Lawn Print", "12.00")))).isEqualTo("Lawn Print × 12");
    }

    @Test
    void namesTwoItemsAndCountsTheRest()
    {
        assertThat(ItemSummary.of(sale(stock("Lawn Print", "3"), stock("Voile", "1"))))
                .isEqualTo("Lawn Print, Voile");
        assertThat(ItemSummary.of(sale(
                stock("Lawn Print", "3"), stock("Voile", "1"), stock("Cambric", "2"), stock("Silk", "5")
        ))).isEqualTo("Lawn Print, Voile +2");
    }

    @Test
    void isNullWhenTheEntryMovesNoGoods()
    {
        TransactionLine cash = TransactionLine.builder()
                .targetKind(TargetKind.CASH)
                .inOut(InOut.IN)
                .value(500.0)
                .build();
        assertThat(ItemSummary.of(sale(cash))).isNull();
    }

    private Transaction sale(TransactionLine... lines)
    {
        Transaction transaction = Transaction.builder().build();
        transaction.getLines().addAll(Arrays.asList(lines));
        return transaction;
    }

    private TransactionLine stock(String itemName, String quantity)
    {
        return TransactionLine.builder()
                .targetKind(TargetKind.STOCK)
                .item(StoreItem.builder().name(itemName).build())
                .inOut(InOut.OUT)
                .quantity(new BigDecimal(quantity))
                .build();
    }
}
