import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, min, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { StoreService } from '../../core/store/store.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { Balance } from '../../core/store/balance.models';
import { PartyService } from '../../core/store/party.service';
import { OpeningDirection, Party, PartyDraft } from '../../core/store/party.models';
import { DigitsOnly, toDigits } from '../../shared/digits-only';

/** Form-facing shape: contact/address are non-null strings for the inputs (blank → null on send). */
interface PartyForm {
  name: string;
  contact: string;
  address: string;
  /** Saved through its own endpoint after the party itself, not part of the draft. */
  openingAmount: number | null;
  openingDir: OpeningDirection;
}

const EMPTY_FORM: PartyForm = { name: '', contact: '', address: '', openingAmount: null, openingDir: 'THEY_OWE_YOU' };

/**
 * Store parties (customers/suppliers) CRUD. Same in-place row editing as Items:
 * "Add party" opens a blank editable row, the pencil turns a row editable, and
 * delete asks for confirmation inline (it cascades transactions on the backend,
 * so the confirm says so). Only one row is editable at a time.
 *
 * With no store yet the list comes back 404; that becomes a "set up your store
 * first" state rather than an error, pointing at General.
 */
@Component({
  selector: 'app-party',
  imports: [FormField, NgTemplateOutlet, DigitsOnly],
  templateUrl: './party.html',
  styleUrl: './party.css',
})
export class SettingsParty {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(PartyService);
  /** Deleting a khata is the owner's — it erases every transaction with them. */
  protected readonly stores = inject(StoreService);

  protected readonly parties = signal<Party[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly editingId = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly confirmingId = signal<string | null>(null);
  protected readonly openingId = signal<string | null>(null);
  protected readonly openingAmount = signal<number | null>(null);
  protected readonly openingDir = signal<OpeningDirection>('THEY_OWE_YOU');
  protected readonly saving = signal(false);
  protected readonly rowErrorKey = signal<TranslationKey | null>(null);
  /** What the row's opening balance was when the editor opened — only a change is sent. */
  private readonly openingBefore = signal<Balance | null>(null);

  protected readonly draft = signal<PartyForm>({ ...EMPTY_FORM });
  protected readonly partyForm = form(this.draft, (p) => {
    required(p.name);
    min(p.openingAmount, 0);
  });

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.parties.set(await this.api.list());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  startAdd(): void {
    this.resetRowState();
    this.draft.set({ ...EMPTY_FORM });
    this.openingBefore.set(null);
    this.adding.set(true);
  }

  startEdit(party: Party): void {
    this.resetRowState();
    this.draft.set({
      name: party.name,
      // Rows saved before the digits-only rule can hold "+92 300-1234567"; strip
      // on load so an untouched contact field can't fail validation on save.
      contact: toDigits(party.contact),
      address: party.address ?? '',
      openingAmount: party.openingBalance ? party.openingBalance.amount : null,
      openingDir: party.openingBalance?.direction === 'YOU_OWE_THEM' ? 'YOU_OWE_THEM' : 'THEY_OWE_YOU',
    });
    this.openingBefore.set(party.openingBalance ?? null);
    this.editingId.set(party.id);
  }

  /** Flip which way the draft's opening balance points. */
  protected setOpeningDir(dir: OpeningDirection): void {
    this.draft.update((d) => ({ ...d, openingDir: dir }));
  }

  cancelEdit(): void {
    this.resetRowState();
  }

  async save(): Promise<void> {
    if (this.partyForm().invalid()) {
      return;
    }
    this.saving.set(true);
    this.rowErrorKey.set(null);
    const draft = this.normalized();
    try {
      const editId = this.editingId();
      const saved = editId ? await this.api.update(editId, draft) : await this.api.create(draft);
      // Create/update do not carry the opening balance, so it rides its own
      // endpoint — and only when it actually moved.
      const withBalance = { ...saved, openingBalance: await this.syncOpening(saved.id) };
      if (editId) {
        this.parties.update((list) => (list ?? []).map((p) => (p.id === editId ? withBalance : p)));
      } else {
        this.parties.update((list) => [withBalance, ...(list ?? [])]);
      }
      this.resetRowState();
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  /** Pushes the editor's opening balance if it changed; returns what the row should now show. */
  private async syncOpening(id: string): Promise<Balance | null> {
    const d = this.draft();
    const before = this.openingBefore();
    if (d.openingAmount === (before?.amount ?? null) && d.openingDir === (before?.direction ?? 'THEY_OWE_YOU')) {
      return before;
    }
    const stored = await this.api.setOpeningBalance(id, { amount: d.openingAmount ?? 0, direction: d.openingDir });
    return stored.direction === 'SETTLED' ? null : stored;
  }

  startOpening(party: Party): void {
    this.resetRowState();
    // Prefill from the current opening so re-opening shows what was entered.
    this.openingAmount.set(party.openingBalance ? party.openingBalance.amount : null);
    this.openingDir.set(party.openingBalance?.direction === 'YOU_OWE_THEM' ? 'YOU_OWE_THEM' : 'THEY_OWE_YOU');
    this.openingId.set(party.id);
  }

  cancelOpening(): void {
    this.resetRowState();
  }

  async saveOpening(id: string): Promise<void> {
    const amount = this.openingAmount();
    if (amount == null || amount < 0) {
      return;
    }
    this.saving.set(true);
    this.rowErrorKey.set(null);
    try {
      const balance = await this.api.setOpeningBalance(id, { amount, direction: this.openingDir() });
      const openingBalance = balance.direction === 'SETTLED' ? null : balance;
      this.parties.update((list) => (list ?? []).map((p) => (p.id === id ? { ...p, openingBalance } : p)));
      this.resetRowState();
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  askDelete(id: string): void {
    this.resetRowState();
    this.confirmingId.set(id);
  }

  cancelDelete(): void {
    this.confirmingId.set(null);
  }

  async confirmDelete(id: string): Promise<void> {
    this.saving.set(true);
    this.rowErrorKey.set(null);
    try {
      await this.api.delete(id);
      this.parties.update((list) => (list ?? []).filter((p) => p.id !== id));
      this.confirmingId.set(null);
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  private resetRowState(): void {
    this.adding.set(false);
    this.editingId.set(null);
    this.confirmingId.set(null);
    this.openingId.set(null);
    this.rowErrorKey.set(null);
  }

  /** Trim text; blank contact/address become null so the backend stores nothing. */
  private normalized(): PartyDraft {
    const d = this.draft();
    const contact = d.contact?.trim();
    const address = d.address?.trim();
    return { name: d.name.trim(), contact: contact ? contact : null, address: address ? address : null };
  }
}
