import { TransactionEventKind } from './cashbook.models';

/** Mirrors the backend `dto/inventory` records (GET /api/inventory). */
export interface ItemStockRow {
  itemId: string;
  name: string;
  unit: string | null;
  salePrice: number | null;
  costPrice: number | null;
  /** Null for a service — work sold has no on-hand quantity. */
  currentStock: number | null;
  service: boolean;
}

export interface ItemMovementRow {
  transactionId: string;
  date: string;
  occurredAt: string;
  event: TransactionEventKind;
  description: string | null;
  inOut: 'IN' | 'OUT';
  quantity: number;
  /** Null for a service — no stock winds up or down. */
  runningStock: number | null;
}

export interface ItemMovement {
  itemId: string;
  name: string;
  unit: string | null;
  currentStock: number | null;
  service: boolean;
  rows: ItemMovementRow[];
}
