import { Component, computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { PartyService } from '../../core/store/party.service';
import { EventService } from '../../core/store/event.service';
import { Party } from '../../core/store/party.models';
import { EventRequest } from '../../core/store/event.models';

/** A just-saved receipt, kept in-session for the "Just entered" rail. */
interface RecentEntry {
  key: number;
  summary: string;
  sub: string;
}

const easternDigits = '۰۱۲۳۴۵۶۷۸۹';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * RECEIPT entry (وصولی / wasooli) — a party pays down their baqaya. A leaner cousin
 * of SALE: an existing party (autocomplete) and the amount received, with a live
 * Effect panel showing the consequence (drawer up, baqaya down). Saves to
 * `POST /api/event` as a RECEIPT (CASH in, PARTY out — both driven by cashAmount;
 * billAmount is unused for receipts) and clears for the next entry.
 *
 * Wasooli only makes sense against a known party, so on save the typed name must
 * resolve to an existing party record — an unmatched name shows an error toast and
 * sends nothing (the backend would record no party movement for a null id anyway).
 */
@Component({
  selector: 'app-receipt',
  templateUrl: './receipt.html',
  styleUrl: './sale.css',
})
export class Receipt {
  protected readonly locale = inject(LocaleService);
  private readonly partyApi = inject(PartyService);
  private readonly events = inject(EventService);

  private keySeq = 1;

  /** Transient error banner text; auto-clears. PrimeNG's Toast is license-gated
   *  (silently drops messages without a valid PrimeUI license), so we roll our own. */
  protected readonly toast = signal<string | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  /** Autocomplete source; empty when there's no store yet (list 404s). */
  protected readonly parties = signal<Party[]>([]);

  protected readonly partyName = signal('');
  protected readonly billDate = signal(todayIso());
  protected readonly billNumber = signal('');
  protected readonly description = signal('');
  protected readonly amount = signal<number | null>(null);

  protected readonly recent = signal<RecentEntry[]>([]);
  protected readonly saving = signal(false);

  protected readonly total = computed(() => this.amount() ?? 0);
  protected readonly canSave = computed(
    () => this.total() > 0 && this.partyName().trim().length > 0 && !this.saving(),
  );

  constructor() {
    this.loadParties();
  }

  private async loadParties(): Promise<void> {
    // Lists 404 before a store exists; not an error here — the field is just empty.
    const parties = await this.partyApi.list().catch(() => [] as Party[]);
    this.parties.set(parties);
  }

  setAmount(value: string): void {
    const n = Number(value);
    this.amount.set(value.trim() === '' || Number.isNaN(n) ? null : n);
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }

    const name = this.partyName().trim();
    const party = this.matchParty(name);
    if (!party) {
      // Wasooli is against existing parties only — no API call for an unknown name.
      this.showToast(this.locale.t('receipt.party.unknown', { name }));
      return;
    }

    this.saving.set(true);
    const amount = this.total();
    const request: EventRequest = {
      transactionEvent: 'RECEIPT',
      cashAmount: amount,
      billAmount: null,
      billNumber: this.billNumber().trim() || null,
      billDate: this.billDate() || null,
      description: this.description().trim() || null,
      party: { partyId: party.id, name: party.name },
      items: [],
    };

    try {
      await this.events.publishEvent(request);
      this.recent.update((rs) =>
        [
          {
            key: this.keySeq++,
            summary: `${this.locale.t('receipt.recent.receipt')} · ${party.name} · ${this.money(amount)}`,
            sub: this.locale.t('receipt.recent.from', { party: party.name }),
          },
          ...rs,
        ].slice(0, 6),
      );
      this.reset();
    } catch {
      this.showToast(this.locale.t('error.generic'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Show a transient error banner, replacing any current one; clears after 4s. */
  private showToast(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }

  reset(): void {
    this.partyName.set('');
    this.billNumber.set('');
    this.description.set('');
    this.amount.set(null);
  }

  /** Rs figure with thousands grouping and script-localized digits. */
  protected money(n: number): string {
    const grouped = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const digits =
      this.locale.locale() === 'ur' ? grouped.replace(/\d/g, (c) => easternDigits[Number(c)]) : grouped;
    return 'Rs ' + digits;
  }

  private matchParty(name: string): Party | undefined {
    const q = name.trim().toLowerCase();
    return this.parties().find((p) => p.name.trim().toLowerCase() === q);
  }
}
