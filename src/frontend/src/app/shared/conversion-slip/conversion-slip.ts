import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { convertQty, formatFactor } from '../../core/units/units';
import { ConversionSlipService } from './conversion-slip.service';

/**
 * The conversion slip: the one place a quantity changes units, shown as the sum it is.
 *
 * A shopkeeper converting by hand writes the quantity, writes the rate under it, rules a line
 * and writes the answer. This is that, in a dialog — three rows sharing one column of figures,
 * a rule above the result, and the rate as the only thing that can be written over. It reads
 * as arithmetic rather than as a form because what is being asked for is agreement with a
 * calculation, not data entry: the shopkeeper needs to see where the number came from before
 * it goes onto their shelf.
 *
 * The rate box is an ordinary `<input>` with an ordinary label — underlined rather than boxed,
 * so the block still reads as a sum, but focusable, announced, and ringed on focus like every
 * other field in the app.
 *
 * Three situations, and the wording says which one it is in:
 *
 * - a rate the table knows (metre → gaz), prefilled, waiting to be confirmed;
 * - a rate this shop taught us (than → metre), prefilled, and it says so;
 * - a rate nobody has ever set, where the box is empty, **Convert** is closed and the slip is
 *   asking a question rather than proposing an answer.
 *
 * A native `<dialog>` for the focus trap, Escape and backdrop; cancelling resolves null and
 * the caller puts the unit box back, because a quantity left in the wrong unit is the bug this
 * whole feature exists to prevent.
 */
@Component({
  selector: 'app-conversion-slip',
  templateUrl: './conversion-slip.html',
  styleUrl: './conversion-slip.css',
})
export class ConversionSlip {
  protected readonly locale = inject(LocaleService);
  protected readonly slip = inject(ConversionSlipService);
  private readonly conversions = inject(UnitConversionService);

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly rateBox = viewChild<ElementRef<HTMLInputElement>>('rateBox');

  /** The rate as typed. Text, not a number, so a half-typed "0." doesn't collapse to zero. */
  protected readonly rateText = signal('');
  protected readonly remember = signal(true);

  /** What the table or the shop already says about this pair; null when nobody has said. */
  protected readonly suggested = computed(() => {
    const ask = this.slip.ask();
    return ask ? this.conversions.factor(ask.from, ask.to) : null;
  });

  protected readonly rate = computed(() => {
    const n = Number(this.rateText());
    return this.rateText().trim() === '' || Number.isNaN(n) ? null : n;
  });

  /** A rate has to be a positive number: zero converts a batch of cloth into nothing. */
  protected readonly canConvert = computed(() => (this.rate() ?? 0) > 0);

  /**
   * The figure that will be saved, rounded exactly the way the shelf will round it. Null while
   * there is nothing to convert — the unit box is often left before the quantity box is
   * reached, and a sum reading "0 Gaz = 0 Meter" would be answering a question nobody asked.
   * The rate can still be agreed; the row applies it to whatever is typed afterwards.
   */
  protected readonly result = computed(() => {
    const ask = this.slip.ask();
    const rate = this.rate();
    return ask && rate !== null && ask.qty !== null ? convertQty(ask.qty, rate) : null;
  });

  /**
   * Whether the box now holds something other than what was suggested. Drives both the
   * provenance line and whether there is anything worth remembering — re-confirming the
   * standard metre/gaz rate should not write a row saying the standard rate is standard.
   */
  protected readonly edited = computed(() => {
    const suggested = this.suggested();
    return suggested === null || this.rate() !== Number(formatFactor(suggested.value));
  });

  /** Where the number in the box came from, as the slip reports it. */
  protected readonly source = computed(() =>
    this.edited() ? 'typed' : (this.suggested()?.source ?? 'typed'),
  );

  /** "than → metre → gaz", for a rate that was chained rather than stated. */
  protected readonly via = computed(() => this.suggested()?.via?.join(' → ') ?? '');

  /**
   * Offered only when there is something new to keep. A rate the shop already holds, or one
   * the fixed table already knows, has nothing to learn from being confirmed again.
   */
  protected readonly offerRemember = computed(() => this.edited() && this.canConvert());

  constructor() {
    // Open and close the dialog with the question, and start each one clean: the rate the
    // pair already has, or an empty box that is itself the question.
    effect(() => {
      const ask = this.slip.ask();
      const el = this.dlg().nativeElement;

      if (!ask) {
        if (el.open) {
          el.close();
        }
        return;
      }

      const suggested = this.suggested();
      this.rateText.set(suggested ? formatFactor(suggested.value) : '');
      this.remember.set(true);

      if (!el.open) {
        el.showModal();
      }
      // An unknown rate is a question, so put the cursor where the answer goes. A known one is
      // a proposal, and stealing focus into it invites overtyping a rate that was already right.
      if (!suggested) {
        queueMicrotask(() => this.rateBox()?.nativeElement.focus());
      }
    });
  }

  protected setRate(value: string): void {
    this.rateText.set(value);
  }

  /** Backdrop click — the ::backdrop pseudo-element belongs to the dialog element itself. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) {
      this.cancel(event);
    }
  }

  protected cancel(event: Event): void {
    event.preventDefault();
    void this.slip.answer(null, false);
  }

  protected convert(event: Event): void {
    event.preventDefault();
    const rate = this.rate();
    if (rate === null || rate <= 0) {
      return;
    }
    void this.slip.answer(
      { factor: rate, source: this.source() },
      this.offerRemember() && this.remember(),
    );
  }
}
