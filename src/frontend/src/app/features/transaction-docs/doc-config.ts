import { TranslationKey } from '../../core/i18n/translations/en';
import { DocKind } from '../../core/store/bill.models';
import { InvoiceLabels } from '../../shared/bill-invoice';
import { PrintPromptKeys } from '../../shared/print-details.service';
import { OwingDirection } from './doc-totals';

/**
 * The list screen's copy. Keys are passed in as literals rather than built from a
 * prefix because `TranslationKey` is a union of the dictionary's literal keys —
 * concatenation would need a cast and lose the missing-key check. Same reasoning as
 * {@link ../new-entry/goods-entry#GoodsEntryLabels}.
 */
export interface DocListLabels {
  title: TranslationKey;
  subtitle: TranslationKey;
  /** The button that opens the entry screen for a fresh one. */
  new: TranslationKey;
  emptyTitle: TranslationKey;
  emptyBody: TranslationKey;
  emptyCta: TranslationKey;
  loadError: TranslationKey;
  searchPh: TranslationKey;
  searchNone: TranslationKey;

  printAll: TranslationKey;
  printError: TranslationKey;
  /** Which of the two layouts to print — separate documents, or one flowing report. */
  printLayout: PrintPromptKeys;
  /** Report footer: how many documents, and what they came to. */
  printCount: TranslationKey;
  printTotal: TranslationKey;
  /** Print-only "items sold" / "items bought" table closing the report. */
  printItems: TranslationKey;

  colNumber: TranslationKey;
  colDate: TranslationKey;
  colParty: TranslationKey;
  colAmount: TranslationKey;
  colActions: TranslationKey;

  filterFrom: TranslationKey;
  filterTo: TranslationKey;
  filterParty: TranslationKey;
  filterAllParties: TranslationKey;
  filterItem: TranslationKey;
  filterAllItems: TranslationKey;

  deleteAction: TranslationKey;
  deleteConfirm: TranslationKey;
  deleteCancel: TranslationKey;
  deleteConfirmBtn: TranslationKey;
  deleteError: TranslationKey;

  detailLoadError: TranslationKey;
  notFound: TranslationKey;
  /** What the WhatsApp button calls this document when it offers to send it. */
  whatsappDoc: TranslationKey;
}

/**
 * Everything that differs between the bill screens and the purchase screens: which
 * event they read, where they live, and what they call things. The behaviour — the
 * filters, the two print layouts, the delete — is identical, so it lives once in
 * {@link ./doc-list#DocList} and {@link ./doc-detail#DocDetail}.
 *
 * The same split as {@link ../new-entry/sale#Sale} / {@link ../new-entry/purchase#Purchase}
 * over one shared entry screen, applied to the other end of the same two events.
 */
export interface DocConfig {
  /** Which document this is, and the API path segment it is read from. */
  kind: DocKind;
  /** This screen's own store-relative route — its back links and its rows. */
  route: string;
  /** The entry screen behind "New" and "Edit", store-relative. */
  entryRoute: string;
  /**
   * Which way an unpaid one of these leaves the khata, so the printed report can
   * total it as a positive number and net overpayments off it.
   */
  owing: OwingDirection;
  /** The document itself, as rendered by <app-bill-invoice>. */
  invoice: InvoiceLabels;
  labels: DocListLabels;
}
