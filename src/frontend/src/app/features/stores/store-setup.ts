import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { PhoneField } from '../../shared/phone-field/phone-field';
import { OuterBar } from '../../shared/outer-bar/outer-bar';
import { readImageFile } from '../../shared/image-file';
import { ToastService } from '../../shared/toast/toast.service';

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
  costPrice: number | null;
  /** Saved through its own endpoint after the item itself, not part of the draft. */
  openingStock: number | null;
  service: boolean;
}
interface PartyRow {
  name: string;
  contact: string;
  address: string;
  amount: number | null;
  direction: OpeningDirection;
}

const EMPTY_DRAFT: StoreDraft = { name: '', address: '', contact: '', logoUri: '', watermarkUri: '' };
const EMPTY_ITEM: ItemRow = { name: '', unit: '', salePrice: null, costPrice: null, openingStock: null, service: false };
const EMPTY_PARTY: PartyRow = { name: '', contact: '', address: '', amount: null, direction: 'THEY_OWE_YOU' };

/** A figure typed into a money/quantity box is only usable if it isn't negative. */
function negative(...values: Array<number | null>): boolean {
  return values.some((v) => v != null && v < 0);
}

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
  imports: [FormField, PhoneField, RouterLink, OuterBar],
  templateUrl: './store-setup.html',
  styleUrl: './store-setup.css',
})
export class StoreSetup {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly itemApi = inject(StoreItemService);
  private readonly partyApi = inject(PartyService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /**
   * The shop this run is filling in — read from the route, not from whichever shop
   * happens to be selected. A user who came here from the picker still has their
   * last shop selected; without the route as the source of truth the wizard would
   * open on goods, lock the shop section, and write items into that other shop.
   */
  private readonly routeStoreId = inject(ActivatedRoute).snapshot.paramMap.get('storeId');
  private readonly shop = computed(() => (this.routeStoreId ? this.stores.current() : null));

  protected readonly steps = STEPS;
  /** Goods when the route already carries a store — the shop section is what created it. */
  protected readonly step = signal<Step>(this.shop() ? 'goods' : 'shop');
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

  /**
   * The first box of whichever section is open. Adding a row empties the form,
   * and a shopkeeper entering twenty items should never have to reach for the
   * mouse between them — so the caret goes back where they type next.
   */
  private readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');

  /* ── the goods ── */
  protected readonly items = signal<StoreItem[]>([]);
  protected readonly itemRow = signal<ItemRow>({ ...EMPTY_ITEM });
  /**
   * Whether the cost/stock fold is open. A signal rather than the element's own
   * state: a shopkeeper who tracks cost on item one tracks it on all twenty, so
   * the fold has to survive the reset that follows each add.
   */
  protected readonly moreOpen = signal(false);
  /** Common cloth units as free-text hints; the shopkeeper can type any. */
  protected readonly unitSuggestions = ['Meter', 'Than', 'Gaz', 'Piece', 'Roll'];

  /* ── the khatas ── */
  protected readonly parties = signal<Party[]>([]);
  protected readonly partyRow = signal<PartyRow>({ ...EMPTY_PARTY });

  /* A row is addable once it is named and carries no negative figure. The name
     alone gates the button; a bad figure gets a message, because a button that
     greys out the moment a minus lands says nothing about why. */
  protected readonly itemNegative = computed(() =>
    negative(this.itemRow().salePrice, this.itemRow().costPrice, this.itemRow().openingStock),
  );
  protected readonly partyNegative = computed(() => negative(this.partyRow().amount));
  protected readonly canAddItem = computed(() => !!this.itemRow().name.trim() && !this.itemNegative());
  protected readonly canAddParty = computed(() => !!this.partyRow().name.trim() && !this.partyNegative());

  /** The plate on the spine: the saved shop once there is one, the typed name before that. */
  protected readonly plateName = computed(() => this.shop()?.name ?? this.model().name.trim());
  protected readonly plateLogo = computed(() => this.shop()?.logoUri || this.model().logoUri);
  protected readonly initial = computed(() => this.plateName().charAt(0).toUpperCase());

  /** Leaving early is allowed: into this shop once it exists, else back to the picker. */
  protected readonly exitLink = computed(() => {
    // The shop's root, not its dashboard: the redirect there is what knows whether this shop
    // opens on the board or on the dashboard.
    const id = this.shop()?.id;
    return id ? ['/s', id] : ['/stores'];
  });

  /**
   * Whether there is anywhere to leave *to*. A user opening their very first shop
   * has nothing behind them — the picker would send them straight back here — so
   * the control is hidden rather than left as a button that does nothing. An
   * unloaded list (a cold deep link) counts as "probably has shops": showing a
   * working way out beats hiding one.
   */
  protected readonly canExit = computed(
    () => !!this.shop() || (this.stores.stores()?.length ?? 1) > 0,
  );

  constructor() {
    if (this.shop()) {
      void this.loadExisting();
    }
  }

  /** A refresh mid-setup should show what is already saved, not an empty list. */
  private async loadExisting(): Promise<void> {
    try {
      const [items, parties] = await Promise.all([this.itemApi.list(), this.partyApi.list()]);
      // Only fill a list that is still untouched. On a slow connection the user
      // can add a row before this lands, and setting it outright would wipe that
      // row off the leaf — saved on the server, invisible on the page.
      if (!this.items().length) {
        this.items.set(items);
      }
      if (!this.parties().length) {
        this.parties.set(parties);
      }
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
    return this.shop() ? step === 'shop' : step !== 'shop';
  }

  async goTo(step: Step): Promise<void> {
    if (this.locked(step) || step === this.step()) {
      return;
    }
    // A row that is typed but not yet added is still the user's work. Leaving
    // used to drop it silently — the one place this screen could lose data.
    if (!(await this.commitPending())) {
      return;
    }
    this.errorKey.set(null);
    this.step.set(step);
  }

  /**
   * Writes whatever is sitting half-typed in the open section's add row. Returns
   * false only when that write was attempted and failed, which is the signal to
   * stay put — moving on would strand the error message on a section the user
   * can no longer see.
   */
  private async commitPending(): Promise<boolean> {
    switch (this.step()) {
      case 'goods':
        return this.itemRow().name.trim() ? this.addItem() : true;
      case 'khatas':
        return this.partyRow().name.trim() ? this.addParty() : true;
      default:
        return true;
    }
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
      this.toast.success(this.locale.t('toast.saved', { label: created.name }));
      // replaceUrl: Back from the goods section must land on the picker, not on
      // the create form again — that path ends in a second, accidental shop.
      await this.router.navigate(['/s', created.id, 'setup'], { replaceUrl: true });
    } catch (err) {
      // The plan's shop ceiling is the one failure here the user can act on, and this is where
      // they meet it: the picker greys its button out, but this route is reachable directly and
      // deliberately still offers itself when the plan could not be read.
      //
      // ponytail: a 403 is worded as the ceiling, though it can also mean the plan has ended —
      // reachable only for a user let in on someone else's shop, whom the picker's own notice
      // has already told. Ask PlanService here if that stops being the only case.
      const status = (err as { status?: number } | null)?.status;
      this.errorKey.set(status === 403 ? 'stores.addLimit' : 'error.generic');
    } finally {
      this.busy.set(false);
    }
  }

  async addItem(): Promise<boolean> {
    const row = this.itemRow();
    const name = row.name.trim();
    if (!name || this.busy()) {
      return !name;
    }
    if (this.itemNegative()) {
      this.errorKey.set('setup.negative');
      return false;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      const unit = row.unit.trim();
      const created = await this.itemApi.create({
        name,
        unit: unit || null,
        salePrice: row.salePrice,
        costPrice: row.costPrice,
        service: row.service,
      });
      // Create does not carry opening stock, so it rides its own endpoint — and
      // only when there is one. A service holds no stock, so it never sends.
      let openingStock: number | null = null;
      if (!row.service && row.openingStock && row.openingStock > 0) {
        const stored = await this.itemApi.setOpeningStock(created.id, row.openingStock);
        openingStock = stored > 0 ? stored : null;
      }
      this.items.update((list) => [...list, { ...created, openingStock }]);
      // The fold's open/closed state is deliberately left alone here — and so is the unit,
      // for the same reason: a shop that measures in metres measures all twenty items in
      // metres, and retyping "Meter" nineteen times is what makes a setup feel like paperwork.
      this.itemRow.set({ ...EMPTY_ITEM, unit });
      this.focusFirstField();
      return true;
    } catch {
      this.errorKey.set('error.generic');
      return false;
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

  async addParty(): Promise<boolean> {
    const row = this.partyRow();
    const name = row.name.trim();
    if (!name || this.busy()) {
      return !name;
    }
    if (this.partyNegative()) {
      this.errorKey.set('setup.negative');
      return false;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      const contact = row.contact.trim();
      const address = row.address.trim();
      const created = await this.partyApi.create({
        name,
        contact: contact || null,
        address: address || null,
      });
      // The baqaya is a second call — the party has to exist to carry one.
      let openingBalance: Balance | null = null;
      if (row.amount && row.amount > 0) {
        openingBalance = await this.partyApi.setOpeningBalance(created.id, {
          amount: row.amount,
          direction: row.direction,
        });
      }
      this.parties.update((list) => [...list, { ...created, openingBalance }]);
      // Which way the baqaya leans carries over, like the unit above: someone working through
      // their customers is entering ten balances that all lean the same way.
      this.partyRow.set({ ...EMPTY_PARTY, direction: row.direction });
      this.focusFirstField();
      return true;
    } catch {
      this.errorKey.set('error.generic');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Back to the top of the form, once the emptied row has actually rendered. */
  private focusFirstField(): void {
    requestAnimationFrame(() => this.firstField()?.nativeElement.focus());
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
  async finish(): Promise<void> {
    const id = this.shop()?.id;
    if (!id || !(await this.commitPending())) {
      return;
    }
    await this.router.navigate(['/s', id, 'dashboard'], { queryParams: { new: 1 } });
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

  /**
   * Ticking "service" empties the stock box rather than only hiding it — a
   * quantity typed before the tick would otherwise be sent for something that
   * cannot hold stock.
   */
  protected setService(on: boolean): void {
    this.itemRow.update((r) => ({ ...r, service: on, openingStock: on ? null : r.openingStock }));
  }

  /** The stock tag on a written line; nothing to say when no opening was entered. */
  protected stockLabel(item: StoreItem): string | null {
    return item.openingStock
      ? this.locale.t('setup.goods.inStock', { qty: this.locale.formatNumber(item.openingStock) })
      : null;
  }

  protected balanceTone(balance: Balance | null | undefined): 'in' | 'out' | null {
    if (!balance || balance.direction === 'SETTLED') {
      return null;
    }
    return balance.direction === 'THEY_OWE_YOU' ? 'in' : 'out';
  }
}
