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
