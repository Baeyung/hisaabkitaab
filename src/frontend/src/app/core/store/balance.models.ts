/**
 * Mirrors the backend `dto/common` pair: a party balance is a non-negative
 * amount plus the direction that carries the sign, so no screen re-derives
 * "they owe you" vs "you owe them" from raw sign math.
 */
export type BalanceDirection = 'THEY_OWE_YOU' | 'YOU_OWE_THEM' | 'SETTLED';

export interface Balance {
  amount: number;
  direction: BalanceDirection;
}
