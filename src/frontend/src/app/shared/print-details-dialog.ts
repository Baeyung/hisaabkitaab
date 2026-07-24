import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { PrintDetailsService } from './print-details.service';

/**
 * Themed two-choice print prompt — replaces the browser confirm box. A native
 * <dialog> so focus-trap, Escape and the backdrop come for free; we only theme
 * it. Mounted once in the shell; opens whenever the print service asks, showing
 * whichever wording that caller passed (cashbook/ledger ask about bill details,
 * bill management asks invoices vs. report). Escape / backdrop / the dialog's
 * own cancel resolve as null (no print).
 */
@Component({
  selector: 'app-print-details-dialog',
  template: `
    <dialog #dlg class="rm-dialog" (cancel)="answer($event, null)" (click)="onBackdrop($event)">
      <h2 class="rm-dialog__title">{{ locale.t(printer.promptKeys().title) }}</h2>
      <p class="rm-dialog__body">{{ locale.t(printer.promptKeys().body) }}</p>
      <div class="rm-dialog__actions">
        <button type="button" class="rm-btn rm-btn--ghost" (click)="answer($event, false)">
          {{ locale.t(printer.promptKeys().no) }}
        </button>
        <button type="button" class="rm-btn rm-btn--primary" (click)="answer($event, true)">
          {{ locale.t(printer.promptKeys().yes) }}
        </button>
      </div>
    </dialog>
  `,
})
export class PrintDetailsDialog {
  protected readonly locale = inject(LocaleService);
  protected readonly printer = inject(PrintDetailsService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.printer.prompting()) {
        if (!el.open) {
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    });
  }

  /** Backdrop click (the ::backdrop pseudo-element is the dialog element itself). */
  onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) {
      this.answer(event, null);
    }
  }

  answer(event: Event, choice: boolean | null): void {
    event.preventDefault();
    this.printer.answer(choice);
  }
}
