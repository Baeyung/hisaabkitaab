import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { StoreDraft } from '../../core/store/store.models';
import { StoreItemService } from '../../core/store/store-item.service';
import { StoreItem } from '../../core/store/store-item.models';
import { PartyService } from '../../core/store/party.service';
import { Balance } from '../../core/store/balance.models';
import { OpeningDirection, Party } from '../../core/store/party.models';
import { DigitsOnly } from '../../shared/digits-only';
import { OuterBar } from '../../shared/outer-bar/outer-bar';
import { readImageFile } from '../../shared/image-file';

/** The three sections of the register, in the order they are opened. */
type Step = 'shop' | 'goods' | 'khatas';
const STEPS: ReadonlyArray<{ id: Step; label: TranslationKey }> = [
  { id: 'shop', label: 'setup.section.shop' },
  { id: 'goods', label: 'setup.section.goods' },
  { id: 'khatas', label: 'setup.section.khatas' },
];

type ImageField = 'logoUri' | 'watermarkUri';

interface ItemRow {
  name: string;
  unit: string;
  salePrice: number | null;
}
interface PartyRow {
  name: string;
  contact: string;
  amount: number | null;
  direction: OpeningDirection;
}

const EMPTY_DRAFT: StoreDraft = { name: '', address: '', contact: '', logoUri: '', watermarkUri: '' };
const EMPTY_ITEM: ItemRow = { name: '', unit: '', salePrice: null };
const EMPTY_PARTY: PartyRow = { name: '', contact: '', amount: null, direction: 'THEY_OWE_YOU' };

/**
 * Opening a new shop, one section at a time — the screen a shopkeeper lands on
 * instead of a bare create form.
 *
 * It spans two routes on purpose. `/stores/new` writes the shop itself; once the
 * backend has it there is an id to scope by, so the remaining sections run at
 * `/s/:storeId/setup`, where storeGuard has selected the store and
 * StoreItemService / PartyService work unchanged. Which section is open is read
 * back from that: with a store in hand, the shop section is already written.
 *
 * Items and parties are saved as each is added rather than batched at the end —
 * a half-finished setup then leaves a real, usable shop behind instead of
 * nothing, and closing the tab costs the user only what they hadn't typed yet.
 */
@Component({
  selector: 'app-store-setup',
  imports: [FormField, DigitsOnly, RouterLink, OuterBar],
  templateUrl: './store-setup.html',
  styleUrl: './store-setup.css',
})
export class StoreSetup {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly itemApi = inject(StoreItemService);
  private readonly partyApi = inject(PartyService);
  private readonly router = inject(Router);

  protected readonly steps = STEPS;
  /** Goods when a store is already selected — the shop section is what created it. */
  protected readonly step = signal<Step>(this.stores.current() ? 'goods' : 'shop');
  protected readonly stepIndex = computed(() => STEPS.findIndex((s) => s.id === this.step()));

  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly imageErrorKey = signal<TranslationKey | null>(null);

  /* ── the shop ── */
  protected readonly model = signal<StoreDraft>({ ...EMPTY_DRAFT });
  protected readonly shopForm = form(this.model, (path) => {
    required(path.name);
  });
  protected readonly openingCash = signal<number | null>(null);
  protected readonly mediaFields: ReadonlyArray<{ field: ImageField; label: TranslationKey }> = [
    { field: 'logoUri', label: 'settings.general.logo' },
    { field: 'watermarkUri', label: 'settings.general.watermark' },
  ];

  /* ── the goods ── */
  protected readonly items = signal<StoreItem[]>([]);
  protected readonly itemRow = signal<ItemRow>({ ...EMPTY_ITEM });
  /** Common cloth units as free-text hints; the shopkeeper can type any. */
  protected readonly unitSuggestions = ['Meter', 'Than', 'Gaz', 'Piece', 'Roll'];

  /* ── the khatas ── */
  protected readonly parties = signal<Party[]>([]);
  protected readonly partyRow = signal<PartyRow>({ ...EMPTY_PARTY });

  /** The plate on the spine: the saved shop once there is one, the typed name before that. */
  protected readonly plateName = computed(
    () => this.stores.current()?.name ?? this.model().name.trim(),
  );
  protected readonly plateLogo = computed(
    () => this.stores.current()?.logoUri || this.model().logoUri,
  );
  protected readonly initial = computed(() => this.plateName().charAt(0).toUpperCase());

  /** Leaving early is allowed: into the shop if it exists, else back to the picker. */
  protected readonly exitLink = computed(() => {
    const id = this.stores.currentId();
    return id ? ['/s', id, 'dashboard'] : ['/stores'];
  });

  /**
   * Whether there is anywhere to leave *to*. A user opening their very first shop
   * has nothing behind them — the picker would send them straight back here — so
   * the control is hidden rather than left as a button that does nothing. An
   * unloaded list (a cold deep link) counts as "probably has shops": showing a
   * working way out beats hiding one.
   */
  protected readonly canExit = computed(
    () => !!this.stores.currentId() || (this.stores.stores()?.length ?? 1) > 0,
  );

  constructor() {
    if (this.stores.current()) {
      void this.loadExisting();
    }
  }

  /** A refresh mid-setup should show what is already saved, not an empty list. */
  private async loadExisting(): Promise<void> {
    try {
      const [items, parties] = await Promise.all([this.itemApi.list(), this.partyApi.list()]);
      this.items.set(items);
      this.parties.set(parties);
    } catch {
      // A brand-new shop has nothing to list; the sections still work empty.
    }
  }

  /**
   * Sections open in one direction only. Before the shop is saved there is
   * nothing to hang items or khatas on; after it is saved the shop section is
   * behind us — its edits belong to Settings › General from then on.
   */
  protected locked(step: Step): boolean {
    return this.stores.current() ? step === 'shop' : step !== 'shop';
  }

  goTo(step: Step): void {
    if (this.locked(step)) {
      return;
    }
    this.errorKey.set(null);
    this.step.set(step);
  }

  async createShop(): Promise<void> {
    if (this.shopForm().invalid() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      const created = await this.stores.create(this.model());
      // The remaining sections call store-scoped APIs; select before they can.
      this.stores.select(created.id);
      const cash = this.openingCash();
      if (cash && cash > 0) {
        await this.stores.setOpeningCash(cash);
      }
      // replaceUrl: Back from the goods section must land on the picker, not on
      // the create form again — that path ends in a second, accidental shop.
      await this.router.navigate(['/s', created.id, 'setup'], { replaceUrl: true });
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.busy.set(false);
    }
  }

  async addItem(): Promise<void> {
    const row = this.itemRow();
    const name = row.name.trim();
    if (!name || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      const unit = row.unit.trim();
      const created = await this.itemApi.create({
        name,
        unit: unit || null,
        salePrice: row.salePrice,
        costPrice: null,
      });
      this.items.update((list) => [...list, created]);
      this.itemRow.set({ ...EMPTY_ITEM });
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.busy.set(false);
    }
  }

  async removeItem(id: string): Promise<void> {
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      await this.itemApi.delete(id);
      this.items.update((list) => list.filter((it) => it.id !== id));
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.busy.set(false);
    }
  }

  async addParty(): Promise<void> {
    const row = this.partyRow();
    const name = row.name.trim();
    if (!name || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      const contact = row.contact.trim();
      const created = await this.partyApi.create({ name, contact: contact || null, address: null });
      // The baqaya is a second call — the party has to exist to carry one.
      let openingBalance: Balance | null = null;
      if (row.amount && row.amount > 0) {
        openingBalance = await this.partyApi.setOpeningBalance(created.id, {
          amount: row.amount,
          direction: row.direction,
        });
      }
      this.parties.update((list) => [...list, { ...created, openingBalance }]);
      this.partyRow.set({ ...EMPTY_PARTY });
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.busy.set(false);
    }
  }

  async removeParty(id: string): Promise<void> {
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      await this.partyApi.delete(id);
      this.parties.update((list) => list.filter((p) => p.id !== id));
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.busy.set(false);
    }
  }

  /** Into the shop, flagged as freshly opened so the dashboard greets rather than shrugs. */
  finish(): void {
    const id = this.stores.currentId();
    if (id) {
      void this.router.navigate(['/s', id, 'dashboard'], { queryParams: { new: 1 } });
    }
  }

  async onFile(event: Event, field: ImageField): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the user re-pick the same file after a rejection
    if (!file) {
      return;
    }
    const result = await readImageFile(file);
    this.imageErrorKey.set(result.error ?? null);
    if (result.uri) {
      this.model.update((m) => ({ ...m, [field]: result.uri }));
    }
  }

  removeImage(field: ImageField): void {
    this.imageErrorKey.set(null);
    this.model.update((m) => ({ ...m, [field]: '' }));
  }

  protected balanceTone(balance: Balance | null | undefined): 'in' | 'out' | null {
    if (!balance || balance.direction === 'SETTLED') {
      return null;
    }
    return balance.direction === 'THEY_OWE_YOU' ? 'in' : 'out';
  }
}
