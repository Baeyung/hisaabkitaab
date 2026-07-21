import { Balance } from './balance.models';
import { TransactionEventKind } from './cashbook.models';

/** Mirrors the backend `dto/ledger` records (GET /api/ledger). */
export interface PartyBalanceRow {
  partyId: string;
  name: string;
  contact: string | null;
  balance: Balance;
}

export interface PartyStatementRow {
  transactionId: string;
  date: string;
  occurredAt: string;
  event: TransactionEventKind;
  description: string | null;
  inOut: 'IN' | 'OUT';
  amount: number;
  runningBalance: Balance;
  /** For a charge (a bill): true once FIFO payments have covered it; null for payment rows. */
  cleared: boolean | null;
}

export interface PartyStatement {
  partyId: string;
  partyName: string;
  contact: string | null;
  rows: PartyStatementRow[];
  currentBalance: Balance;
  totalBilled: number;
  totalPaid: number;
  lastPaymentDate: string | null;
}

/** An expense entry inside a category group, with the category's running spend. */
export interface ExpenseCategoryRow {
  transactionId: string;
  date: string;
  occurredAt: string;
  description: string | null;
  amount: number;
  runningTotal: number;
}

/** All expenses of one category collapsed into a khata head (GET /api/ledger/expense-categories). */
export interface ExpenseCategoryGroup {
  /** The category name — a seed token (PARTS…) or whatever the shopkeeper typed. */
  category: string;
  count: number;
  total: number;
  rows: ExpenseCategoryRow[];
}
