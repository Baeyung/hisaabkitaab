import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';

import { AdminApi, WhatsAppBlock } from './admin-api';

/**
 * Everyone who has told a shop to stop messaging them on WhatsApp, and the one button that
 * undoes it.
 *
 * The opt-out page a customer confirms on says plainly that it cannot be undone except by
 * asking us — so this screen is the whole of "asking us". Nothing here is bulk: a block comes
 * off one at a time, after somebody has actually spoken to the person it belongs to.
 */
@Component({
  selector: 'app-blocks',
  templateUrl: './blocks.html',
})
export class Blocks {
  private readonly api = inject(AdminApi);

  protected readonly blocks = signal<WhatsAppBlock[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  /** The row waiting on a confirm, so the button turns into a question in place. */
  protected readonly confirming = signal<string | null>(null);
  protected readonly working = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.blocks.set(await this.api.whatsappBlocks());
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async unblock(block: WhatsAppBlock): Promise<void> {
    this.working.set(block.id);
    this.error.set('');
    try {
      await this.api.unblockWhatsapp(block.id);
      this.blocks.update((rows) => rows.filter((row) => row.id !== block.id));
      this.confirming.set(null);
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.working.set(null);
    }
  }
}

function message(error: unknown): string {
  return error instanceof HttpErrorResponse && error.error?.message
    ? error.error.message
    : 'Something went wrong. Try again.';
}
