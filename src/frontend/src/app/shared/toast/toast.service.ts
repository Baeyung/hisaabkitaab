import { Service, signal } from '@angular/core';

const TOAST_MS = 4000;

export type ToastKind = 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

/**
 * App-wide toast queue, rendered once by {@link ToastHost} in the app shell.
 *
 * Home-grown rather than PrimeNG's Toast, which is license-gated — without a
 * valid PrimeUI license it silently drops messages, and a confirmation the
 * shopkeeper never sees is worse than none (see `error.generic` copy).
 *
 * Data loads stay on skeletons and say nothing here — this is only for the
 * result of something the shopkeeper *did* (save, delete, ...), so a save
 * never looks like it silently vanished into the drawer.
 */
@Service()
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 0;

  success(text: string): void {
    this.push('success', text);
  }

  error(text: string): void {
    this.push('error', text);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, text: string): void {
    const id = ++this.nextId;
    this._toasts.update((list) => [...list, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), TOAST_MS);
  }
}
