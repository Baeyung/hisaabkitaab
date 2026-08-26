import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { LedgerService } from '../../core/store/ledger.service';
import { StoreService } from '../../core/store/store.service';
import { BalanceDirection } from '../../core/store/balance.models';
import { ExpenseCategoryGroup, PartyBalanceRow } from '../../core/store/ledger.models';
import { expenseCategoryLabel } from '../../core/store/event.models';
import { directionClass, directionKey } from '../../shared/balance.util';
import { RowWindowDirective, rowWindow } from '../../shared/row-window';
import { urlFilters } from '../../shared/url-filters';
import { Combobox } from '../../shared/combobox/combobox';
import { Select } from '../../shared/select/select';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { AmountLegend } from '../../shared/amount-legend';
import { CaptureModeService } from '../../shared/capture-mode.service';

/**
 * The khata list: every party with their baqaya and which way it points.
 * Rows open the party's statement. Both filters are client-side — a shop's
 * party list is at most a few hundred names — but they live in the URL, so
 * Back walks the narrowing back and a copied link opens on the same view.
 */
@Component({
  selector: 'app-ledger',
  imports: [
    RouterLink,
    Combobox,
    Select,
    PrintHeader,
    WhatsAppButton,
    AmountLegend,
    RowWindowDirective,
  ],
  templateUrl: './ledger.html',
})
export class Ledger {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(LedgerService);
  private readonly router = inject(Router);
  protected readonly capture = inject(CaptureModeService);

  protected readonly parties = signal<PartyBalanceRow[] | null>(null);
  protected readonly categories = signal<ExpenseCategoryGroup[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /** Both sections start shut — a khata with hundreds of parties would otherwise
   *  force a scroll past all of them just to reach the expenses block below. */
  protected readonly partiesOpen = signal(false);
  protected readonly categoriesOpen = signal(false);

  /** `q` is the name/contact search, `dir` the way the baqaya points ('' = every khata). */
  protected readonly filters = urlFilters({ q: '', dir: '' });

  /** The direction rows, worded exactly as the balance column words them. */
  protected readonly directionOptions = computed(() => [
    { value: '', label: this.locale.t('ledger.filter.all') },
    ...(['THEY_OWE_YOU', 'YOU_OWE_THEM', 'SETTLED'] as const).map((d) => ({
      value: d,
      label: this.locale.t(directionKey(d)),
    })),
  ]);

  /**
   * Narrowed by direction only. The search suggestions come off this rather than
   * off every party, so a name the direction filter has already excluded is never
   * offered as a match that then shows nothing.
   */
  private readonly byDirection = computed(() => {
    const dir = this.filters.dir();
    const all = this.parties() ?? [];
    return dir ? all.filter((p) => p.balance.direction === dir) : all;
  });

  /**
   * The search box's dropdown. Deduped: two parties can be on the books under one
   * name, and the listbox tracks its options by their text.
   */
  protected readonly nameOptions = computed(() => [
    ...new Set(this.byDirection().map((p) => p.name)),
  ]);

  protected readonly filtered = computed(() => {
    const q = this.filters.q().trim().toLowerCase();
    const rows = this.byDirection();
    return q
      ? rows.filter((p) => p.name.toLowerCase().includes(q) || (p.contact ?? '').includes(q))
      : rows;
  });

  /** The rows the table renders — a wholesaler's khata runs to hundreds of parties. */
  protected readonly win = rowWindow(this.filtered);

  /** "Nothing matched" reads differently when it was the search that emptied the table. */
  protected readonly emptyKey = computed<TranslationKey>(() =>
    this.filters.q().trim() ? 'ledger.search.none' : 'ledger.filter.none',
  );

  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;

  /** The active direction filter's label, for the line the printout carries. */
  protected readonly directionFilterLabel = computed(() =>
    this.locale.t(directionKey(this.filters.dir() as BalanceDirection)),
  );

  /** Display label for a spend head: seed tokens translated, custom names shown raw. */
  protected readonly categoryLabel = (name: string): string =>
    expenseCategoryLabel(name, (k) => this.locale.t(k));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [parties, categories] = await Promise.all([this.api.list(), this.api.listExpenseCategories()]);
      this.parties.set(parties);
      this.categories.set(categories);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  open(partyId: string): void {
    void this.router.navigate(this.stores.link('ledger', partyId));
  }

  openCategory(category: string): void {
    void this.router.navigate(this.stores.link('ledger/category', category));
  }

  print(): void {
    window.print();
  }
}
