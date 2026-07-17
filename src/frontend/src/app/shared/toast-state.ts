import { signal } from '@angular/core';

const TOAST_MS = 4000;

/**
 * Transient error-banner state for the entry screens.
 *
 * Home-grown rather than PrimeNG's Toast, which is license-gated — without a
 * valid PrimeUI license it silently drops messages, and an error the shopkeeper
 * never sees is worse than no error handling at all.
 *
 * Plain class, not a service: the banner belongs to one screen, and a singleton
 * would leak messages across routes.
 */
export class ToastState {
  private readonly _message = signal<string | null>(null);
  readonly message = this._message.asReadonly();

  private timer?: ReturnType<typeof setTimeout>;

  /** Show a message, replacing any current one; auto-clears after 4s. */
  show(message: string): void {
    this._message.set(message);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._message.set(null), TOAST_MS);
  }

  /** Drop the pending timer. Wire to `DestroyRef.onDestroy` so a message shown
   *  just before navigation doesn't tick away against a dead component. */
  dispose(): void {
    clearTimeout(this.timer);
  }
}
