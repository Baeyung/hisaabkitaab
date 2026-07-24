import { TransactionEventKind } from '../core/store/cashbook.models';

/** The entry screen each editable event opens in edit mode. */
const EDIT_SCREEN: Partial<Record<TransactionEventKind, string>> = {
  SALE: 'sale',
  PURCHASE: 'purchase',
  RECEIPT: 'receipt',
  PAYMENT: 'payment',
  EXPENSE: 'expense',
};

/** Whether a row's entry can be edited/deleted — opening entries are managed in Settings. */
export function isEditableEntry(event: TransactionEventKind): boolean {
  return event in EDIT_SCREEN;
}

/** Router link to an entry's edit screen, or null for a non-editable (opening) event. */
export function entryEditLink(event: TransactionEventKind, transactionId: string): string[] | null {
  const screen = EDIT_SCREEN[event];
  return screen ? ['/new-entry', screen, transactionId] : null;
}
