/** Mirrors the backend `dto/dashboard` records (GET /api/dashboard). */
export interface DashboardDailyPoint {
  date: string;
  sales: number;
  spend: number;
  profit: number;
}

export interface DashboardTopItem {
  itemId: string;
  name: string;
  unit: string | null;
  quantity: number;
  revenue: number;
}

export interface DashboardDeadStockItem {
  itemId: string;
  name: string;
  unit: string | null;
  stock: number;
  value: number;
}

export interface DashboardPartyRef {
  partyId: string;
  name: string;
  amount: number;
}

export interface DashboardExpenseGroup {
  description: string;
  count: number;
  total: number;
}

export interface Dashboard {
  from: string;
  to: string;
  /** Net cash in the galla as of `to` — the drawer position, not profit. */
  cashPosition: number;
  /** Profit over the window: sales − cost of goods sold − expenses. */
  profit: number;
  sales: number;
  spend: number;
  receivablesTotal: number;
  payablesTotal: number;
  daily: DashboardDailyPoint[];
  topItems: DashboardTopItem[];
  deadStock: DashboardDeadStockItem[];
  topReceivables: DashboardPartyRef[];
  topPayables: DashboardPartyRef[];
  topExpenses: DashboardExpenseGroup[];
}
