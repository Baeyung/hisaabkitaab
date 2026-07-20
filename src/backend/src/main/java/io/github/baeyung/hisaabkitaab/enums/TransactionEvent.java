package io.github.baeyung.hisaabkitaab.enums;

/**
 * The business event a {@code TRANSACTION} represents.
 * Extend this list as new event types are needed.
 */
public enum TransactionEvent
{
    SALE,
    PURCHASE,
    RECEIPT,
    PAYMENT,
    EXPENSE,
    ADJUSTMENT,
    OPENING_BALANCE,
    OPENING_STOCK,
    OPENING_CASH
}
