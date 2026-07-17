import { TransactionEventKind } from './cashbook.models';

/** Mirrors the backend `dto/inventory` records (GET /api/inventory). */
export interface ItemStockRow {
  itemId: string;
  name: string;
  unit: string | null;
  salePrice: number | null;
  costPrice: number | null;
  currentStock: number;
}

export interface ItemMovementRow {
  transactionId: string;
  date: string;
  occurredAt: string;
  event: TransactionEventKind;
  description: string | null;
  inOut: 'IN' | 'OUT';
  quantity: number;
  runningStock: number;
}

export interface ItemMovement {
  itemId: string;
  name: string;
  unit: string | null;
  currentStock: number;
  rows: ItemMovementRow[];
}
