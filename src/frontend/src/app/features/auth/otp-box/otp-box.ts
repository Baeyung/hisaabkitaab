import { Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';
import { DigitsOnly } from '../../../shared/digits-only';

export const OTP_LENGTH = 6;
export const OTP_PATTERN = /^\d{6}$/;

/**
 * The six-cell one-time-code box, shared by every flow that asks for a code
 * (signup verification, password reset).
 *
 * One real input, six painted cells: the input keeps paste, native one-time-code
 * autofill and the caret; the cells just mirror its value. Styling lives in
 * styles/auth.css under `.otp`.
 */
@Component({
  selector: 'app-otp-box',
  imports: [DigitsOnly],
  template: `
    <div class="otp" [class.otp--err]="invalid()">
      <input
        #otpInput
        [id]="inputId()"
        class="otp__input"
        [value]="value()"
        [maxDigits]="OTP_LENGTH"
        type="tel"
        inputmode="numeric"
        autocomplete="one-time-code"
        autofocus
        (input)="value.set($any($event.target).value)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false)"
      />
      @for (digit of cells(); track $index) {
        <div
          class="otp__cell"
          [class.otp__cell--on]="digit"
          [class.otp__cell--at]="focused() && $index === caret()"
          aria-hidden="true"
        >
          {{ digit }}
        </div>
      }
    </div>
  `,
})
export class OtpBox {
  /** The code as typed so far. Two-way: reset it to '' to clear the box. */
  readonly value = model('');
  /** Paints the row red — the caller sets it when the backend rejected the code. */
  readonly invalid = input(false);
  /** Id of the real input, so the caller's `<label for>` points at it. */
  readonly inputId = input('otp');

  protected readonly OTP_LENGTH = OTP_LENGTH;
  protected readonly focused = signal(false);
  private readonly otpInput = viewChild.required<ElementRef<HTMLInputElement>>('otpInput');

  /** One slot per digit; empty string where nothing has been typed yet. */
  protected readonly cells = computed(() => {
    const otp = this.value();
    return Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '');
  });

  /** The cell the real (hidden) caret sits in; parks on the last one when full. */
  protected readonly caret = computed(() => Math.min(this.value().length, OTP_LENGTH - 1));

  /** Puts the caret back after a rejected code, so the next one can be typed straight away. */
  focus(): void {
    this.otpInput().nativeElement.focus();
  }
}
