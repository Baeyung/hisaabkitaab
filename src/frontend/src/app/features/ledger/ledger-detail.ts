import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { StoreService } from '../../core/store/store.service';
import { EventService } from '../../core/store/event.service';
import { PartyStatement, PartyStatementRow } from '../../core/store/ledger.models';
import { Balance } from '../../core/store/balance.models';
import { TransactionEventKind } from '../../core/store/cashbook.models';
import { TranslationKey } from '../../core/i18n/translations/en';
import { entryDetailLink, entryEditLink, isEditableEntry } from '../../shared/entry-route';
import { deleteErrorKey } from '../../core/store/delete-error';
import { directionClass, directionKey, khataAmount } from '../../shared/balance.util';
import { PrintHeader } from '../../shared/print-header';
import { todayIso } from '../../shared/date.util';
import { urlFilters } from '../../shared/url-filters';
import {
  DOC_TOTAL_KEYS,
  ExpandableDocs,
  PrintDetailsService,
} from '../../shared/print-details.service';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { Select } from '../../shared/select/select';
import { DateField } from '../../shared/date-field/date-field';

/** Zero balance for a range with no rows in it. */
const SETTLED: Balance = { amount: 0, direction: 'SETTLED' };

/**
 * One party's khata statement: every entry with the running baqaya, clean
 * enough to read down the counter with the party on the phone. The party id
 * arrives via router input binding.
 */
@Component({
  selector: 'app-ledger-detail',
  imports: [RouterLink, PrintHeader, Select, DateField, WhatsAppButton],
  templateUrl: './ledger-detail.html',
})
export class LedgerDetail {
  readonly partyId = input.required<string>();

  protected readonly locale = inject(LocaleService);

  protected readonly stores = inject(StoreService);
  private readonly api = inject(LedgerService);
  private readonly events = inject(EventService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly printer = inject(PrintDetailsService);

  /** The row awaiting delete confirmation, and whether a delete is in flight. */
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<TranslationKey | null>(null);

  /** Editable kind, and this user may write here — a viewer gets the statement, no controls. */
  protected canEdit(event: TransactionEventKind): boolean {
    return this.stores.canEdit() && isEditableEntry(event);
  }

  protected readonly statement = signal<PartyStatement | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  // Report filters — client-side over the already-loaded rows, and carried in
  // the URL so Back walks them back. The range is seeded from the statement's
  // own span on load (see `load`) so it reads as "everything so far" instead of
  // rendering as two blank, collapsed date fields.
  protected readonly filters = urlFilters({ from: todayIso(), to: todayIso(), event: '' });

  /** Event kinds actually present, for the filter dropdown (statement order preserved). */
  protected readonly eventKinds = computed(() => [
    ...new Set((this.statement()?.rows ?? []).map((r) => r.event)),
  ]);

  protected readonly eventOptions = computed(() => [
    { value: '', label: this.locale.t('report.filter.allEvents') },
    ...this.eventKinds().map((kind) => ({ value: kind, label: this.eventLabel(kind) })),
  ]);

  protected readonly filteredRows = computed<PartyStatementRow[]>(() => {
    const from = this.filters.from();
    const to = this.filters.to();
    const event = this.filters.event();
    // row.date is an ISO `YYYY-MM-DD` string, so lexical comparison is a date comparison.
    return (this.statement()?.rows ?? []).filter(
      (row) =>
        (!from || row.date >= from) && (!to || row.date <= to) && (!event || row.event === event),
    );
  });

  /**
   * The stat cards, over the filtered rows so they always agree with the table
   * under them. Same maths the backend runs for the whole statement
   * (`LedgerQueryService.statement`): charges are IN, payments OUT, and the
   * balance is the last row's running balance — here the last *visible* one,
   * i.e. the baqaya as it stood at the end of the range. The header chip stays
   * on `currentBalance`: today's baqaya doesn't change because you filtered.
   */
  protected readonly stats = computed(() => {
    const rows = this.filteredRows();
    const total = (dir: 'IN' | 'OUT') =>
      rows.reduce((sum, row) => (row.inOut === dir ? sum + row.amount : sum), 0);
    return {
      totalBilled: total('IN'),
      totalPaid: total('OUT'),
      balance: rows.at(-1)?.runningBalance ?? SETTLED,
      // Rows are chronological, so the last payment in range is the latest one.
      lastPaymentDate: rows.filter((row) => row.inOut === 'OUT').at(-1)?.date ?? null,
    };
  });

  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;
  protected readonly khataAmount = khataAmount;

  /** Bilingual label for an event kind — all kinds have a `report.event.*` key. */
  protected readonly eventLabel = (kind: TransactionEventKind): string =>
    this.locale.t(`report.event.${kind}` as TranslationKey);

  constructor() {
    effect(() => {
      void this.load(this.partyId());
    });
  }

  /** Sub-row totals wording, per side of the counter — see DOC_TOTAL_KEYS. */
  protected readonly docKeys = DOC_TOTAL_KEYS;

  print(): void {
    void this.printer.printWithDetails(this.expandable());
  }

  /**
   * The WhatsApp send goes through the same document-details question Print asks, so
   * the party gets the statement the shopkeeper chose to send. Bound as a field, not a
   * method, so the template hands over a callable rather than its result.
   */
  protected readonly expandForSend = (): Promise<boolean> =>
    this.printer.expandDetails(this.expandable());

  /**
   * Every row that stands for a goods document, whose lines the details prompt can
   * expand. A customer's statement is all bills and a supplier's all purchases, but
   * a party can be both — someone you sell to and buy from — so both are collected.
   */
  private expandable(): ExpandableDocs {
    const ids = (event: TransactionEventKind) =>
      (this.statement()?.rows ?? [])
        .filter((row) => row.event === event)
        .map((row) => row.transactionId);
    return { bills: ids('SALE'), purchases: ids('PURCHASE') };
  }

  /**
   * The row's own page, when it has one: the bill for a sale, the batch for a processed-
   * goods entry. Null elsewhere, and the template leaves those rows unlinked.
   */
  protected detailLink(event: TransactionEventKind, transactionId: string): string[] | null {
    const link = entryDetailLink(event, transactionId);
    return link ? this.stores.link(...link) : null;
  }

  openDetail(event: TransactionEventKind, transactionId: string): void {
    const link = this.detailLink(event, transactionId);
    if (link) {
      void this.router.navigate(link);
    }
  }

  /** Open the entry's screen in edit mode, prefilled. */
  editEntry(event: TransactionEventKind, transactionId: string): void {
    const link = entryEditLink(event, transactionId);
    if (link) {
      void this.router.navigate(this.stores.link(...link));
    }
  }

  askDelete(transactionId: string): void {
    this.deleteError.set(null);
    this.pendingDelete.set(transactionId);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const id = this.pendingDelete();
    if (!id) {
      return;
    }
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.events.deleteEvent(id);
      this.pendingDelete.set(null);
      await this.load(this.partyId());
    } catch (err) {
      this.deleteError.set(deleteErrorKey(err, 'entry.delete.error'));
    } finally {
      this.deleting.set(false);
    }
  }

  async load(partyId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      const statement = await this.api.getStatement(partyId);
      this.statement.set(statement);
      // Rows are chronological (the running balance depends on it), so the ends
      // of the list are the range. Today is the floor for `to` so a party with
      // no entries yet — or one whose last entry is old — still reads sanely;
      // ISO dates compare lexically, so a future-dated row wins over today.
      // A URL naming a range already wins: it is a shared link, or a Back that
      // landed here, and re-seeding would throw away what it asked for. The
      // seed replaces rather than pushes — nobody chose it, so Back shouldn't
      // step through it.
      if (!this.route.snapshot.queryParamMap.has('from')) {
        const rows = statement.rows;
        const today = todayIso();
        const last = rows.at(-1)?.date ?? '';
        this.filters.replace({
          from: rows[0]?.date ?? today,
          to: last > today ? last : today,
        });
      }
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.notFound.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
