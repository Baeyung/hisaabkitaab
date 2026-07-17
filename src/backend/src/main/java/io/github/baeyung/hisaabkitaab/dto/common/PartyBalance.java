package io.github.baeyung.hisaabkitaab.dto.common;

/**
 * A party balance for display: a non-negative amount plus the direction that
 * carries the sign. The single place the read side turns a signed net
 * (Σ IN − Σ OUT over PARTY lines) into "they owe you" / "you owe them",
 * so every screen agrees on rounding and sign.
 */
public record PartyBalance(double amount, BalanceDirection direction)
{
    /** Treat |net| below half a paisa as settled — line values are doubles. */
    private static final double EPSILON = 0.005;

    public static PartyBalance of(double net)
    {
        if (net > EPSILON)
        {
            return new PartyBalance(net, BalanceDirection.THEY_OWE_YOU);
        }
        if (net < -EPSILON)
        {
            return new PartyBalance(-net, BalanceDirection.YOU_OWE_THEM);
        }
        return new PartyBalance(0, BalanceDirection.SETTLED);
    }
}
