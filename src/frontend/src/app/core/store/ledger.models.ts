import { Balance } from './balance.models';
import { TransactionEventKind } from './cashbook.models';
import { ExpenseCategory } from './event.models';

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
}

export interface PartyStatement {
  partyId: string;
  partyName: string;
  contact: string | null;
  rows: PartyStatementRow[];
  currentBalance: Balance;
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
  category: ExpenseCategory;
  count: number;
  total: number;
  rows: ExpenseCategoryRow[];
}
