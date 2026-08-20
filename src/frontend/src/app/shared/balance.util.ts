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
