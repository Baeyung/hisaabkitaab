import { BillDetail } from '../../core/store/bill.models';
import { CashbookDay } from '../../core/store/cashbook.models';
import { ItemStockRow } from '../../core/store/inventory.models';
import { PartyBalanceRow, PartyStatement } from '../../core/store/ledger.models';

/**
 * Mirrors the backend `dto/report` records (GET /api/reports/…).
 *
 * Every section is a type the app already has, because every section is a call the app already
 * makes — the report is the shop's own screens on one sheet of paper, not a second reading of
 * the books. See `ReportQueryService`.
 */

/**
 * The shop as its own letterhead. A narrower thing than `Store`: no role, no menu, nothing the
 * scheduler has no business sending to an open endpoint.
 */
export interface ReportStore {
  id: string;
  name: string;
  address: string | null;
  contact: string | null;
  logoUri: string | null;
  watermarkUri: string | null;
}

/** One shop's day, as the nightly job prints it for the owner. */
export interface DailyReport {
  date: string;
  store: ReportStore;
  cashbook: CashbookDay;
  bills: BillDetail[];
  purchases: BillDetail[];
  /** Every khata as it stands at the day's end — a position, not a record of the day. */
  parties: PartyBalanceRow[];
  /** The same for goods: what is on the shelf when the shutter comes down. */
  stock: ItemStockRow[];
}

/** One khata holder's statement, as the monthly job sends it to them. */
export interface PartyReminder {
  date: string;
  store: ReportStore;
  statement: PartyStatement;
  /** How long their oldest unpaid bill has sat, by FIFO settlement — why they were picked. */
  daysStale: number;
}
