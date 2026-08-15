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

/** The screen each event that has a record of its own opens read-only. */
const DETAIL_SCREEN: Partial<Record<TransactionEventKind, string>> = {
  SALE: 'bill-management',
  PURCHASE: 'purchases',
  PROCESSING: 'processing',
};

/**
 * Route segments to an entry's own page — the bill for a sale, the supplier's record for
 * a purchase, the batch for a processed-goods entry — or null for an event that has none
 * (a receipt is only ever a ledger row). Store-relative, like {@link entryEditLink}.
 */
export function entryDetailLink(
  event: TransactionEventKind,
  transactionId: string,
): string[] | null {
  const screen = DETAIL_SCREEN[event];
  return screen ? [screen, transactionId] : null;
}

/**
 * Route segments to an entry's edit screen, or null for a non-editable (opening) event.
 * Store-relative: callers pass these through {@code StoreService.link}, which puts the
 * current shop in front.
 */
export function entryEditLink(event: TransactionEventKind, transactionId: string): string[] | null {
  const screen = EDIT_SCREEN[event];
  return screen ? ['new-entry', screen, transactionId] : null;
}
