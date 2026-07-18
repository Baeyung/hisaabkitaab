import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { PartyService } from '../../core/store/party.service';
import { OpeningDirection, Party, PartyDraft } from '../../core/store/party.models';

/** Form-facing shape: contact/address are non-null strings for the inputs (blank → null on send). */
interface PartyForm {
  name: string;
  contact: string;
  address: string;
}

const EMPTY_FORM: PartyForm = { name: '', contact: '', address: '' };

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
  imports: [FormField, RouterLink, NgTemplateOutlet],
  templateUrl: './party.html',
  styleUrl: './party.css',
})
export class SettingsParty {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(PartyService);

  protected readonly parties = signal<Party[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);

  protected readonly editingId = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly confirmingId = signal<string | null>(null);
  protected readonly openingId = signal<string | null>(null);
  protected readonly openingAmount = signal<number | null>(null);
  protected readonly openingDir = signal<OpeningDirection>('THEY_OWE_YOU');
  protected readonly saving = signal(false);
  protected readonly rowErrorKey = signal<TranslationKey | null>(null);

  protected readonly draft = signal<PartyForm>({ ...EMPTY_FORM });
  protected readonly partyForm = form(this.draft, (p) => required(p.name));

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      this.parties.set(await this.api.list());
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.noStore.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  startAdd(): void {
    this.resetRowState();
    this.draft.set({ ...EMPTY_FORM });
    this.adding.set(true);
  }

  startEdit(party: Party): void {
    this.resetRowState();
    this.draft.set({
      name: party.name,
      contact: party.contact ?? '',
      address: party.address ?? '',
    });
    this.editingId.set(party.id);
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
      if (editId) {
        const updated = await this.api.update(editId, draft);
        this.parties.update((list) => (list ?? []).map((p) => (p.id === editId ? updated : p)));
      } else {
        const created = await this.api.create(draft);
        this.parties.update((list) => [created, ...(list ?? [])]);
      }
      this.resetRowState();
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
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
