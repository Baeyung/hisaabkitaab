import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { BillService } from '../../core/store/bill.service';
import { EventService } from '../../core/store/event.service';
import { StoreService } from '../../core/store/store.service';
import { BillDetail } from '../../core/store/bill.models';
import { PrintHeader } from '../../shared/print-header';
import { BillInvoice } from '../../shared/bill-invoice';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { TranslationKey } from '../../core/i18n/translations/en';
import { deleteErrorKey } from '../../core/store/delete-error';
import { Perspective, PrintDetailsService } from '../../shared/print-details.service';
import { DocConfig } from './doc-config';

/**
 * One goods document, derived from the transaction that recorded it: line items,
 * goods total, the cash side, and what went on the khata. The transaction id
 * arrives from the parent, which reads it off the route.
 *
 * Bills and purchases share this screen; {@link DocConfig} carries the wording and
 * which of the two is being read. See {@link ./doc-list#DocList}.
 */
@Component({
  selector: 'app-doc-detail',
  imports: [RouterLink, PrintHeader, BillInvoice, WhatsAppButton],
  templateUrl: './doc-detail.html',
})
export class DocDetail {
  readonly config = input.required<DocConfig>();
  readonly docId = input.required<string>();

  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(BillService);
  private readonly events = inject(EventService);
  private readonly router = inject(Router);
  private readonly printer = inject(PrintDetailsService);

  protected readonly bill = signal<BillDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<TranslationKey | null>(null);

  /** Store's own view by default; flipped once the print/WhatsApp prompt asks. */
  protected readonly perspective = signal<Perspective>('store');

  constructor() {
    effect(() => {
      void this.load(this.docId());
    });
  }

  async print(): Promise<void> {
    this.perspective.set(await this.printer.askPerspective());
    window.print();
  }

  /** Bound as a field so the WhatsApp button hands over a callable, not its result. */
  protected readonly beforeSend = async (): Promise<boolean> => {
    this.perspective.set(await this.printer.askPerspective());
    return true;
  };

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      this.bill.set(await this.api.getDetail(this.config().kind, id));
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.notFound.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  askDelete(): void {
    this.deleteError.set(null);
    this.confirming.set(true);
  }

  cancelDelete(): void {
    this.confirming.set(false);
  }

  async confirmDelete(): Promise<void> {
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.events.deleteEvent(this.docId());
      void this.router.navigate(this.stores.link(this.config().route));
    } catch (err) {
      this.deleteError.set(deleteErrorKey(err, this.config().labels.deleteError));
      this.deleting.set(false);
    }
  }
}
