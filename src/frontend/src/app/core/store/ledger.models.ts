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
}

export interface PartyStatement {
  partyId: string;
  partyName: string;
  contact: string | null;
  rows: PartyStatementRow[];
  currentBalance: Balance;
}
