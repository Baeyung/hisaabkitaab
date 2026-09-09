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
  /** Knocked off the bill before cash is weighed against it — only ever sent on a SALE/PURCHASE. */
  discountAmount?: number | null;
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
  'PARTS' | 'ELECTRICITY' | 'GENERAL' | 'MISC' | 'SALARIES' | 'UNCATEGORIZED';

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
export function expenseCategoryLabel(name: string, t: (key: TranslationKey) => string): string {
  return name in EXPENSE_CATEGORY_LABEL ? t(EXPENSE_CATEGORY_LABEL[name as ExpenseCategory]) : name;
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
  /**
   * The unit the line was written in — carried only so a name typed here for the first time
   * becomes a catalogue item in that unit rather than in a guess. Nothing else reads it:
   * `quantity` has already been converted to the item's own shelf unit. Blank where the shop
   * has switched the unit box off, and the store's default unit stands in on the backend.
   */
  unit: string;
  quantity: number;
  itemSoldAt: number;
  /**
   * What this shop's own entry columns held on the line, when it has arranged any — see
   * `CustomFieldsSettings`. Absent for a shop running the built-in grid, and for every line
   * written before the column existed, which reads back as the two default ids taken from
   * `quantity` and `itemSoldAt` (see `storedValues`).
   *
   * Carried, not computed from: `quantity` and `itemSoldAt` above stay the numbers stock and
   * every total are folded from, and the entry screen derives them so their product is
   * exactly the line total the grid showed.
   */
  customFields?: Record<string, number> | null;
}
