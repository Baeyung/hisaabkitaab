import { Balance } from './balance.models';

/** Mirrors the backend `dto/transaction` bill records (GET /api/transactions/bills). */
export interface BillSummary {
  id: string;
  billNumber: string | null;
  date: string;
  partyName: string | null;
  amount: number;
}

export interface BillLine {
  itemId: string | null;
  itemName: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number;
  amount: number;
}

export interface BillDetail {
  id: string;
  billNumber: string | null;
  date: string;
  description: string | null;
  partyName: string | null;
  lines: BillLine[];
  goodsTotal: number;
  cashReceived: number;
  outstanding: Balance;
}
