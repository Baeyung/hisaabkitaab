import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { PartyService } from '../../core/store/party.service';
import { EventService } from '../../core/store/event.service';
import { Party } from '../../core/store/party.models';
import { EventRequest } from '../../core/store/event.models';
import { todayIso } from '../../shared/date.util';
import { RecentLog } from '../../shared/recent-log';
import { ToastState } from '../../shared/toast-state';
import { Combobox } from '../../shared/combobox/combobox';
import { DateField } from '../../shared/date-field/date-field';

/**
 * The screen's copy. Keys are passed in as literals rather than built from a
 * prefix because `TranslationKey` is a union of the dictionary's literal keys —
 * concatenation would need a cast and lose the missing-key check.
 */
export interface PartyCashEntryLabels {
  newEntry: TranslationKey;
  title: TranslationKey;
  party: TranslationKey;
  partyPh: TranslationKey;
  partyHint: TranslationKey;
  partyUnknown: TranslationKey;
  amount: TranslationKey;
  billNumber: TranslationKey;
  billNumberPh: TranslationKey;
  description: TranslationKey;
  descriptionPh: TranslationKey;
  clear: TranslationKey;
  saveNext: TranslationKey;
  effect: TranslationKey;
  effectDrawer: TranslationKey;
  effectBaqaya: TranslationKey;
  effectEmpty: TranslationKey;
  recent: TranslationKey;
  recentLabel: TranslationKey;
  recentCounterparty: TranslationKey;
}

export interface PartyCashEntryConfig {
  /** Namespaces the DOM ids so two instances could coexist. */
  idPrefix: string;
  /** Which way cash moves: 'in' fills the drawer (receipt), 'out' empties it (payment). */
  drawerFlow: 'in' | 'out';
  labels: PartyCashEntryLabels;
}

/**
 * Shared entry surface for the two party↔cash events — RECEIPT (وصولی) and
 * PAYMENT (ادائیگی). A leaner cousin of SALE: an existing party (autocomplete)
 * and an amount, with a live Effect panel showing the consequence. Saves to
 * `POST /api/event` and clears for the next entry.
 *
 * Both events move the same single amount, so only `cashAmount` is sent
 * (`billAmount` is unused here); the backend's event processor fans it out into
 * the accounting sides — CASH in / PARTY out for a receipt, the mirror for a
 * payment. Either way the party's baqaya goes down, which is why the party row
 * reads the same on both screens and only the drawer arrow flips.
 *
 * These only make sense against a known party, so on save the typed name must
 * resolve to an existing party record — an unmatched name shows an error toast
 * and sends nothing (the backend would record no party movement for a null id
 * anyway).
 */
@Component({
  selector: 'app-party-cash-entry',
  templateUrl: './party-cash-entry.html',
  styleUrl: './sale.css',
  imports: [Combobox, DateField],
})
export class PartyCashEntry {
  readonly eventType = input.required<'RECEIPT' | 'PAYMENT'>();
  readonly config = input.required<PartyCashEntryConfig>();

  protected readonly locale = inject(LocaleService);
  private readonly partyApi = inject(PartyService);
  private readonly events = inject(EventService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  /** Set from the `:entryId` route param — non-null means "edit this entry", not "add new". */
  protected readonly editId = signal<string | null>(null);

  protected readonly toast = new ToastState();

  /** Autocomplete source; empty when there's no store yet (list 404s). */
  protected readonly parties = signal<Party[]>([]);

  /** Just the names, for the combobox suggestion list. */
  protected readonly partyNames = computed(() => this.parties().map((p) => p.name));

  protected readonly partyName = signal('');
  protected readonly billDate = signal(todayIso());
  protected readonly billNumber = signal('');
  protected readonly description = signal('');
  protected readonly amount = signal<number | null>(null);

  protected readonly recent = new RecentLog();
  protected readonly saving = signal(false);

  protected readonly total = computed(() => this.amount() ?? 0);
  protected readonly canSave = computed(
    () => this.total() > 0 && this.partyName().trim().length > 0 && !this.saving(),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.toast.dispose());
    void this.init();
  }

  private async init(): Promise<void> {
    await this.loadParties();
    const id = this.route.snapshot.paramMap.get('entryId');
    if (id) {
      await this.loadEntry(id);
    }
  }

  private async loadParties(): Promise<void> {
    // Lists 404 before a store exists; not an error here — the field is just empty.
    const parties = await this.partyApi.list().catch(() => [] as Party[]);
    this.parties.set(parties);
  }

  private async loadEntry(id: string): Promise<void> {
    try {
      const e = await this.events.getEvent(id);
      this.editId.set(id);
      this.partyName.set(e.party?.name ?? '');
      this.amount.set(e.cashAmount);
      this.billNumber.set(e.billNumber ?? '');
      this.description.set(e.description ?? '');
      if (e.billDate) {
        this.billDate.set(e.billDate);
      }
    } catch {
      // Missing or not editable (e.g. an opening entry) — fall back to the blank add form.
      this.toast.show(this.locale.t('error.generic'));
    }
  }

  setAmount(value: string): void {
    const n = Number(value);
    this.amount.set(value.trim() === '' || Number.isNaN(n) ? null : n);
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }

    const labels = this.config().labels;
    const name = this.partyName().trim();
    const party = this.matchParty(name);
    if (!party) {
      // Recorded against existing parties only — no API call for an unknown name.
      this.toast.show(this.locale.t(labels.partyUnknown, { name }));
      return;
    }

    this.saving.set(true);
    const amount = this.total();
    const request: EventRequest = {
      transactionEvent: this.eventType(),
      cashAmount: amount,
      billAmount: null,
      billNumber: this.billNumber().trim() || null,
      billDate: this.billDate() || null,
      description: this.description().trim() || null,
      party: { partyId: party.id, name: party.name },
      items: [],
    };

    try {
      const editId = this.editId();
      if (editId) {
        await this.events.updateEvent(editId, request);
        this.location.back();
        return;
      }
      await this.events.publishEvent(request);
      this.recent.push(
        `${this.locale.t(labels.recentLabel)} · ${party.name} · ${this.locale.money(amount)}`,
        this.locale.t(labels.recentCounterparty, { party: party.name }),
      );
      this.reset();
    } catch {
      this.toast.show(this.locale.t('error.generic'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Leave edit mode without saving — back to wherever the edit was launched from. */
  cancel(): void {
    this.location.back();
  }

  reset(): void {
    this.partyName.set('');
    this.billNumber.set('');
    this.description.set('');
    this.amount.set(null);
  }

  private matchParty(name: string): Party | undefined {
    const q = name.trim().toLowerCase();
    return this.parties().find((p) => p.name.trim().toLowerCase() === q);
  }
}
