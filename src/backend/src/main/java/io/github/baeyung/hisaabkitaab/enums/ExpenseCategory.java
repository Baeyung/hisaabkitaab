package io.github.baeyung.hisaabkitaab.enums;

/**
 * What an {@code EXPENSE} was for. Stamped on the expense's CASH line so the khata
 * can total outgoings by head (parts, bijli, salaries…). Null on every non-expense
 * line; {@code UNCATEGORIZED} is the default when the shopkeeper doesn't pick one.
 */
public enum ExpenseCategory
{
    PARTS,
    ELECTRICITY,
    GENERAL,
    MISC,
    SALARIES,
    UNCATEGORIZED
}
