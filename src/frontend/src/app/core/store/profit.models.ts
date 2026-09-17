/**
 * Mirrors the backend `dto/profit` records (GET /api/stores/{id}/profit).
 *
 * Every cost here is reconstructed by replaying the goods ledger, not read off the catalogue —
 * see `CostReplay` on the backend. `coveragePct` is how much of the revenue that replay could
 * actually price, and the screen leads with it.
 */
export interface ProfitDailyPoint {
  date: string;
  revenue: number;
  cogs: number;
  /** Gross, not net: an expense is a lump on one day, so spreading it would invent a loss. */
  profit: number;
  marginPct: number;
}

export interface ProfitItem {
  itemId: string;
  name: string;
  unit: string | null;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
}

/** A design that sold with nothing behind it to price against. */
export interface ProfitUncostedItem {
  itemId: string;
  name: string;
  unit: string | null;
  quantity: number;
  revenue: number;
  /** True when the books have seen it arrive — so the fix is a cost price, not a purchase entry. */
  everPurchased: boolean;
}

export interface ProfitDayRef {
  date: string;
  profit: number;
  revenue: number;
}

/**
 * One design's line on the statement — every sale of it in the window, whether or not the
 * replay could price it. Rates are window averages; profit and margin cover the costed part
 * only, and `uncostedRevenue` is the slice they leave out.
 */
export interface ProfitStatementLine {
  itemId: string;
  name: string;
  unit: string | null;
  quantity: number;
  saleRate: number;
  revenue: number;
  costedQuantity: number;
  costRate: number;
  cogs: number;
  profit: number;
  marginPct: number;
  uncostedRevenue: number;
}

/** One expense head's total. `category` is null for lines filed without one. */
export interface ProfitExpenseLine {
  category: string | null;
  amount: number;
}

export interface Profit {
  from: string;
  to: string;
  revenue: number;
  discounts: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  marginPct: number;
  /** Share of the window's revenue whose cost was known — the trust figure on every number below. */
  coveragePct: number;
  uncostedRevenue: number;
  daily: ProfitDailyPoint[];
  topItems: ProfitItem[];
  lossMakers: ProfitItem[];
  uncosted: ProfitUncostedItem[];
  /** Null when only one day traded — one day is both, and two cards would read as two facts. */
  bestDay: ProfitDayRef | null;
  worstDay: ProfitDayRef | null;
  /** The working behind the headline, most revenue first. */
  statement: ProfitStatementLine[];
  /** The expenses figure by head, largest first. */
  expensesByCategory: ProfitExpenseLine[];
}
