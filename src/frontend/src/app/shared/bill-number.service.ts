import { Injectable } from '@angular/core';

interface BillNumberState {
  mode: 'prefix' | 'numeric';
  seq: number;
}

const KEY_PREFIX = 'hk.billNo.';

/**
 * Suggests the next bill/reference number for a store's entry screens, and learns
 * from what actually gets saved. Starts from the store's initials — "Kapra Ghar"
 * suggests KG-1, KG-2, … — but the moment a shopkeeper types a plain number
 * instead (their own numbering, e.g. 4321), suggestions follow that sequence
 * instead (4322, 4323, …).
 *
 * Kept in localStorage rather than the backend: this is a per-device typing
 * shortcut, not a ledger fact, so nothing here needs to reconcile across devices.
 */
@Injectable({ providedIn: 'root' })
export class BillNumberService {
  /** The number to prefill a fresh entry with. A suggestion only — never sent unless kept. */
  next(storeId: string, storeName: string): string {
    const state = this.load(storeId);
    return state.mode === 'numeric' ? String(state.seq) : `${this.initials(storeName)}-${state.seq}`;
  }

  /**
   * Called once a new entry has actually saved, so the next suggestion continues from
   * what really went out. A bare number switches the store onto the shopkeeper's own
   * numbering; the auto-assigned shape keeps the sequence going; anything else (a
   * one-off freeform bill number) is left alone rather than guessed at.
   */
  record(storeId: string, storeName: string, saved: string | null): void {
    const value = (saved ?? '').trim();
    if (!value) {
      return;
    }
    if (/^\d+$/.test(value)) {
      this.save(storeId, { mode: 'numeric', seq: Number(value) + 1 });
      return;
    }
    const match = value.match(/^([A-Za-z]+)-(\d+)$/);
    if (match && match[1].toUpperCase() === this.initials(storeName)) {
      this.save(storeId, { mode: 'prefix', seq: Number(match[2]) + 1 });
    }
  }

  private initials(storeName: string): string {
    const letters = storeName
      .trim()
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
    return letters || 'B';
  }

  private load(storeId: string): BillNumberState {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + storeId);
      const parsed = raw ? (JSON.parse(raw) as Partial<BillNumberState>) : null;
      if (parsed && (parsed.mode === 'numeric' || parsed.mode === 'prefix') && Number.isFinite(parsed.seq)) {
        return parsed as BillNumberState;
      }
    } catch {
      // Corrupt or blocked storage — start the sequence over.
    }
    return { mode: 'prefix', seq: 1 };
  }

  private save(storeId: string, state: BillNumberState): void {
    try {
      localStorage.setItem(KEY_PREFIX + storeId, JSON.stringify(state));
    } catch {
      // Storage full/blocked — the suggestion just won't advance next time.
    }
  }
}
