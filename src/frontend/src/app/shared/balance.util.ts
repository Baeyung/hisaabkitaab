import { BalanceDirection } from '../core/store/balance.models';
import { TranslationKey } from '../core/i18n/translations/en';

/**
 * One place the UI maps a balance direction to its label and tone, so the
 * ledger list, khata statement, and bill detail can never disagree on which
 * way "they owe you" points. Labels are always paired with the color — never
 * color alone (APPLICATION_DOMAIN §4).
 */
export function directionKey(direction: BalanceDirection): TranslationKey {
  switch (direction) {
    case 'THEY_OWE_YOU':
      return 'auth.hero.theyOwe';
    case 'YOU_OWE_THEM':
      return 'auth.hero.youOwe';
    default:
      return 'ledger.settled';
  }
}

/**
 * Flips a direction to the other side of the counter — what reads as "they owe
 * you" (green) from the shop's books reads as "you owe them" (red) to the party
 * holding the same paper. Used wherever a statement/bill leaves the shop's own
 * screen: the reminder report (always the party's copy) and the print/WhatsApp
 * perspective prompt (PrintDetailsService.askPerspective).
 */
export function invertDirection(direction: BalanceDirection): BalanceDirection {
  switch (direction) {
    case 'THEY_OWE_YOU':
      return 'YOU_OWE_THEM';
    case 'YOU_OWE_THEM':
      return 'THEY_OWE_YOU';
    default:
      return direction;
  }
}

/** The khata column's own IN/OUT, flipped the same way as {@link invertDirection}. */
export function invertInOut(inOut: 'IN' | 'OUT' | 'NONE'): 'IN' | 'OUT' | 'NONE' {
  switch (inOut) {
    case 'IN':
      return 'OUT';
    case 'OUT':
      return 'IN';
    default:
      return inOut;
  }
}

export function directionClass(direction: BalanceDirection): string {
  switch (direction) {
    case 'THEY_OWE_YOU':
      return 'amt--in';
    case 'YOU_OWE_THEM':
      return 'amt--out';
    default:
      return 'amt--settled';
  }
}

/**
 * The khata figure on a statement row, or null when the entry left nothing on it — one
 * settled in full, or one that is only a record. The statement screen and the reminder
 * report both read the column through here, so a fully-paid bill can never print a bare
 * "0" on one and an em dash on the other.
 */
export function khataAmount(row: { inOut: 'IN' | 'OUT' | 'NONE'; amount: number }): number | null {
  return row.inOut === 'NONE' || Math.abs(row.amount) < 0.005 ? null : row.amount;
}
