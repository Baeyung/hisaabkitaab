package io.github.baeyung.hisaabkitaab.dto.common;

/**
 * Which way a party balance points, in the shopkeeper's language
 * (never "debit/credit"): they owe you, you owe them, or settled.
 */
public enum BalanceDirection
{
    THEY_OWE_YOU,
    YOU_OWE_THEM,
    SETTLED
}
