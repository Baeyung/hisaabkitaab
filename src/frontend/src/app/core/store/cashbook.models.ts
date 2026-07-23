/** Mirrors the backend `dto/cashbook` records (GET /api/cashbook). */
export type TransactionEventKind =
  | 'SALE'
  | 'PURCHASE'
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
  runningBalance: number;
}

export interface CashbookDay {
  from: string;
  to: string;
  openingBalance: number;
  rows: CashbookRow[];
  totalIn: number;
  totalOut: number;
  closingBalance: number;
}
