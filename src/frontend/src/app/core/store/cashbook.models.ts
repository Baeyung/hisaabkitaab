import { Balance } from './balance.models';

/** Mirrors the backend `dto/cashbook` records (GET /api/cashbook). */
export type TransactionEventKind =
  | 'SALE'
  | 'PURCHASE'
  | 'PROCESSING'
  | 'RECEIPT'
  | 'PAYMENT'
  | 'EXPENSE'
  | 'ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'OPENING_STOCK'
  | 'OPENING_CASH';

export interface CashbookRow {
  transactionId: string;
  occurredAt: string;
  event: TransactionEventKind;
  description: string | null;
  /** Goods on the entry ("Lawn Print × 12") — null when it moves none. */
  itemSummary: string | null;
  partyName: string | null;
  inOut: 'IN' | 'OUT';
  amount: number;
  /**
   * What the same entry did to the party's khata, so `amount` isn't read as the whole
   * story: a 5,000 sale that took 2,000 in cash shows 2,000 here and 3,000 on the khata.
   * SETTLED on an entry that touches no party.
   */
  khata: Balance;
  runningBalance: number;
}

export interface CashbookDay {
  from: string;
  to: string;
  openingBalance: number;
  rows: CashbookRow[];
  totalIn: number;
  totalOut: number;
  /** Which way the khata moved across the rows shown — the "on khata" column's own total. */
  totalKhata: Balance;
  closingBalance: number;
}
