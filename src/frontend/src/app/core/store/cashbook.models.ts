/** Mirrors the backend `dto/cashbook` records (GET /api/cashbook). */
export type TransactionEventKind = 'SALE' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'EXPENSE' | 'ADJUSTMENT';

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
  day: string;
  openingBalance: number;
  rows: CashbookRow[];
  totalIn: number;
  totalOut: number;
  closingBalance: number;
}
