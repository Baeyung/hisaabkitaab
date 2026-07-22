/** Mirrors the backend `dto/dashboard` records (GET /api/dashboard). */
export interface DashboardDailyPoint {
  date: string;
  sales: number;
  spend: number;
  /** Running drawer balance at the day's close — the trend's secondary-axis line. */
  cash: number;
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

/** A receivable party with how long their oldest unpaid charge has sat. */
export interface DashboardStaleParty {
  partyId: string;
  name: string;
  amount: number;
  daysStale: number;
}

export interface DashboardExpenseGroup {
  /** Spend head — a seed token (PARTS…) or a name the shopkeeper typed. */
  category: string;
  count: number;
  total: number;
}

export interface Dashboard {
  from: string;
  to: string;
  /** Net cash in the galla as of `to` — the drawer position. */
  cashPosition: number;
  sales: number;
  spend: number;
  receivablesTotal: number;
  payablesTotal: number;
  daily: DashboardDailyPoint[];
  topItems: DashboardTopItem[];
  deadStock: DashboardDeadStockItem[];
  topReceivables: DashboardPartyRef[];
  topPayables: DashboardPartyRef[];
  staleReceivables: DashboardStaleParty[];
  topExpenses: DashboardExpenseGroup[];
}
