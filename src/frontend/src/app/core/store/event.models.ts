import type { TranslationKey } from '../i18n/translations/en';

/**
 * The transaction-entry contract sent to `POST /api/event`. Mirrors the backend
 * `EventRequest`: the shopkeeper records one business event (a sale, a receipt…)
 * and the backend fans it out into the accounting sides.
 *
 * Party/item ids are optional: when the typed name matches an existing record we
 * send its id, otherwise we send the name only and the backend resolves (or, for
 * parties, will later create) it. `billDate` is an ISO `yyyy-MM-dd` string.
 */
export interface EventRequest {
  transactionEvent: 'SALE' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'EXPENSE' | 'ADJUSTMENT';
  cashAmount: number | null;
  billAmount: number | null;
  description: string | null;
  billNumber: string | null;
  billDate: string | null;
  party: EventParty | null;
  items: EventItem[];
  /** Only sent for EXPENSE; the spend head the cash went to, by name. Auto-created if new. */
  expenseCategory?: string;
}

/**
 * Categories are now per-store free text (see the backend `expense_categories` table),
 * so a category is just its name. The six seed heads keep stable tokens, though, so
 * their bilingual labels still resolve — see {@link expenseCategoryLabel}.
 */
export type ExpenseCategory =
  | 'PARTS'
  | 'ELECTRICITY'
  | 'GENERAL'
  | 'MISC'
  | 'SALARIES'
  | 'UNCATEGORIZED';

/** The i18n key for each seed category's label (typed so `locale.t` accepts it). */
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, TranslationKey> = {
  PARTS: 'expense.category.PARTS',
  ELECTRICITY: 'expense.category.ELECTRICITY',
  GENERAL: 'expense.category.GENERAL',
  MISC: 'expense.category.MISC',
  SALARIES: 'expense.category.SALARIES',
  UNCATEGORIZED: 'expense.category.UNCATEGORIZED',
};

/**
 * A category's display label: seed heads (PARTS, ELECTRICITY…) get their bilingual
 * translation; anything a shopkeeper typed shows raw. Pass `locale.t`.
 */
export function expenseCategoryLabel(
  name: string,
  t: (key: TranslationKey) => string,
): string {
  return name in EXPENSE_CATEGORY_LABEL
    ? t(EXPENSE_CATEGORY_LABEL[name as ExpenseCategory])
    : name;
}

/** A party on the event — `partyId` null when the typed name is new. */
export interface EventParty {
  partyId: string | null;
  name: string;
}

/** A line of goods on the bill — `itemId` null when the typed name is new. */
export interface EventItem {
  itemId: string | null;
  name: string;
  quantity: number;
  itemSoldAt: number;
}
