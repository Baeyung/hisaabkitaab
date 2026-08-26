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
  /** Goods on the entry ("Lawn Print × 12") — null when it moves none. */
  itemSummary: string | null;
  /** 'NONE' on a row that is only a record — a processed-goods batch moves the party no money. */
  inOut: 'IN' | 'OUT' | 'NONE';
  /** What the entry did to the khata: `goodsTotal` − `cashAmount`, unsigned — `inOut` carries the direction. */
  amount: number;
  /** What the entry's goods came to — the bill it stands for. Null on an entry that is not a document. */
  goodsTotal: number | null;
  /** Cash that changed hands on the entry. Null when none did — an opening balance moves no money. */
  cashAmount: number | null;
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

/** One walk-in sale — cash only, no party — with the register's running total (GET /api/ledger/cash-sales). */
export interface CashSaleRow {
  transactionId: string;
  date: string;
  occurredAt: string;
  /** Goods on the sale ("Lawn Print × 12") — null when none were recorded. */
  itemSummary: string | null;
  description: string | null;
  amount: number;
  runningTotal: number;
}
