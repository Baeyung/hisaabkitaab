import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { PrintDetailsService } from './print-details.service';

/**
 * Themed "print with bill details?" prompt — replaces the browser confirm box.
 * A native <dialog> so focus-trap, Escape and the backdrop come for free; we
 * only theme it. Mounted once in the shell; opens whenever the print service
 * asks. Escape / backdrop / the dialog's own cancel resolve as null (no print).
 */
@Component({
  selector: 'app-print-details-dialog',
  template: `
    <dialog #dlg class="rm-dialog" (cancel)="answer($event, null)" (click)="onBackdrop($event)">
      <h2 class="rm-dialog__title">{{ locale.t('common.printDetails.title') }}</h2>
      <p class="rm-dialog__body">{{ locale.t('common.printDetails.confirm') }}</p>
      <div class="rm-dialog__actions">
        <button type="button" class="rm-btn rm-btn--ghost" (click)="answer($event, false)">
          {{ locale.t('common.printDetails.without') }}
        </button>
        <button type="button" class="rm-btn rm-btn--primary" (click)="answer($event, true)">
          {{ locale.t('common.printDetails.with') }}
        </button>
      </div>
    </dialog>
  `,
})
export class PrintDetailsDialog {
  protected readonly locale = inject(LocaleService);
  private readonly printer = inject(PrintDetailsService);
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
