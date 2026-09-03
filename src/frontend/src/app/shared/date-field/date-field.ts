import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { anchorPopup } from '../anchor-popup';

/** Module-level counter so each instance gets a unique grid label id. */
let uid = 0;

interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** Local calendar day of `d` as an ISO `yyyy-MM-dd` string (never UTC). The
 *  year is padded too: a half-typed one (202 on the way to 2026) would other-
 *  wise build a 3-digit string that {@link parseIso} then refuses. */
function toIso(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse an ISO `yyyy-MM-dd` to a local-noon Date (noon dodges DST edges). */
function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}

/** ISO `yyyy-MM-dd` → the typed `dd/mm/yyyy` shown in the text field. */
function isoToTyped(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Parse `dd/mm/yyyy`, `dd-mm-yyyy`, or `yyyy-mm-dd` to ISO; null if not a real
 *  date. The round-trip check rejects overflow like `31/02` → 3 Mar. */
function parseTyped(s: string): string | null {
  const t = s.trim();
  let y: number;
  let mo: number;
  let d: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
  } else {
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
    if (!m) return null;
    [d, mo, y] = [+m[1], +m[2], +m[3]];
  }
  const dt = new Date(y, mo - 1, d, 12);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return toIso(dt);
}

/** Character spans of the day / month / year segments in `dd/mm/yyyy`. */
const SEGS: readonly (readonly [number, number])[] = [
  [0, 2],
  [3, 5],
  [6, 10],
];

/**
 * Styled date field — a themed replacement for `<input type="date">`, whose
 * drop-down calendar the browser draws with zero CSS hooks. Trigger and popup
 * share the visual language of {@link Select}; the popup escapes ancestor
 * `overflow:hidden` via fixed positioning anchored to the trigger's rect.
 *
 * `value` / `valueChange` carry an ISO `yyyy-MM-dd` string (empty = unset).
 * The typed field is a `dd/mm/yyyy` mask, prefilled with the selected day (or
 * today) and edited one segment at a time — digits fill the highlighted segment
 * and hop to the next, so the slashes are never typed. ←/→ or a click pick a
 * segment; Enter commits, ↓ drops into the grid, Esc closes.
 * ARIA date-picker-dialog pattern: a `role=grid` of day buttons with roving
 * tabindex. Keyboard (while a day is focused): ←/→ ±1 day, ↑/↓ ±1 week,
 * Home/End week ends, PageUp/PageDown ±1 month, Enter/Space pick, Esc close.
 * Arrow direction mirrors in RTL so ← always means "visually left".
 */
@Component({
  selector: 'app-date-field',
  template: `
    <div #root class="df" (focusout)="onFocusOut($event)">
      <button
        #trigger
        type="button"
        class="df__btn"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="ariaLabel()"
        [disabled]="disabled()"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        <!-- Falls back to the format hint: an empty label gives the button no
             text to size against, collapsing it to a squished stub. -->
        <span class="df__val" [class.df__val--ph]="!displayValue()">{{
          displayValue() || placeholder() || locale.t('date.typeHint')
        }}</span>
        <svg
          class="df__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      @if (open()) {
        <div
          #popEl
          class="df__pop"
          role="dialog"
          [attr.aria-label]="ariaLabel()"
          [style.top.px]="pop().top"
          [style.left.px]="pop().left"
        >
          <!-- dir=ltr: the mask is read day-first whichever way the page runs, so
               the segment spans below stay the ones the eye sees. -->
          <input
            #typedEl
            class="df__type"
            [class.df__type--error]="!typedValid()"
            type="text"
            dir="ltr"
            inputmode="numeric"
            autocomplete="off"
            [attr.aria-label]="locale.t('date.typeLabel')"
            [attr.placeholder]="locale.t('date.typeHint')"
            [value]="typed()"
            (focus)="focusSeg(0)"
            (click)="onTypedClick($any($event.target))"
            (input)="onTypedInput($any($event.target))"
            (keydown)="onTypedKeydown($event)"
          />
          <div class="df__head">
            <button
              type="button"
              class="df__nav"
              (click)="shiftMonth(-1)"
              [attr.aria-label]="locale.t('date.prevMonth')"
            >
              <svg
                class="kg-flip"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span class="df__title" [attr.id]="gridLabelId" aria-live="polite">{{
              monthLabel()
            }}</span>
            <button
              type="button"
              class="df__nav"
              (click)="shiftMonth(1)"
              [attr.aria-label]="locale.t('date.nextMonth')"
            >
              <svg
                class="kg-flip"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
          <div class="df__grid" role="grid" [attr.aria-labelledby]="gridLabelId">
            <div class="df__row df__row--head" role="row">
              @for (wd of weekdays(); track $index) {
                <span class="df__wd" role="columnheader" [attr.aria-label]="wd.long">{{
                  wd.short
                }}</span>
              }
            </div>
            @for (week of weeks(); track $index) {
              <div class="df__row" role="row">
                @for (cell of week; track cell.iso) {
                  <div class="df__cell" role="gridcell" [attr.aria-selected]="cell.iso === value()">
                    <button
                      type="button"
                      class="df__day"
                      [class.df__day--out]="!cell.inMonth"
                      [class.df__day--today]="cell.iso === today"
                      [class.df__day--active]="cell.iso === focusedIso()"
                      [class.df__day--selected]="cell.iso === value()"
                      [attr.tabindex]="cell.iso === focusedIso() ? 0 : -1"
                      [attr.data-iso]="cell.iso"
                      [attr.aria-label]="fullLabel(cell.iso)"
                      (click)="pick(cell.iso)"
                      (keydown)="onGridKeydown($event)"
                    >
                      {{ cell.day }}
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .df {
      position: relative;
    }
    /* Mirrors .rm-input--date / select.rm-input so the closed control matches. */
    .df__btn {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      width: 100%;
      max-width: 170px;
      padding: 0 13px;
      font-family: inherit;
      font-size: 14.5px;
      font-weight: 500;
      color: var(--kg-ink);
      text-align: start;
      background: var(--kg-card);
      border: 1px solid var(--kg-line-strong);
      border-radius: 10px;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }
    .df__btn:hover:not(:focus):not(:disabled) {
      border-color: var(--kg-brand);
    }
    .df__btn:focus {
      outline: none;
      border-color: var(--kg-brand);
      box-shadow: 0 0 0 3px var(--kg-focus);
    }
    .df__btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .df__val {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .df__val--ph {
      color: var(--kg-placeholder);
      font-weight: 400;
    }
    .df__icon {
      flex-shrink: 0;
      color: var(--kg-faint);
      transition: color 0.15s ease;
    }
    .df__btn:focus .df__icon {
      color: var(--kg-brand);
    }
    /* Fixed so the card's overflow:hidden can't clip it; anchored to the trigger. */
    .df__pop {
      position: fixed;
      z-index: 50;
      padding: 10px;
      background: var(--kg-card);
      border: 1px solid var(--kg-line-strong);
      border-radius: 12px;
      box-shadow: var(--kg-shadow-pop);
    }
    .df__type {
      width: 100%;
      height: 38px;
      margin-bottom: 8px;
      padding: 0 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      color: var(--kg-ink);
      background: var(--kg-surface);
      border: 1px solid var(--kg-line-strong);
      border-radius: 7px;
      /* Even columns, so the segment under edit sits still as digits land. */
      font-variant-numeric: tabular-nums;
    }
    /* The highlight marks the segment being edited, not stray selected text —
       so it wears the picked day's colour instead of the browser's blue. */
    .df__type::selection {
      color: var(--kg-on-brand);
      background: var(--kg-brand-solid);
    }
    .df__type:focus {
      outline: none;
      border-color: var(--kg-brand);
    }
    .df__type--error {
      border-color: var(--kg-out, #a8342a);
    }
    .df__type::placeholder {
      color: var(--kg-placeholder);
      font-weight: 400;
    }
    .df__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .df__nav {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      color: var(--kg-faint);
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }
    .df__nav:hover {
      color: var(--kg-brand);
      background: var(--kg-surface);
    }
    .df__nav:focus-visible {
      outline: 2px solid var(--kg-brand);
      outline-offset: 1px;
    }
    .df__title {
      font-size: 14px;
      font-weight: 700;
      color: var(--kg-ink);
    }
    .df__row {
      display: grid;
      grid-template-columns: repeat(7, 34px);
      gap: 2px;
    }
    .df__wd {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      font-size: 11px;
      font-weight: 700;
      color: var(--kg-faint);
    }
    .df__cell {
      display: flex;
    }
    .df__day {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--kg-ink);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition:
        background-color 0.12s ease,
        color 0.12s ease;
    }
    .df__day:hover {
      background: var(--kg-surface);
    }
    .df__day:focus-visible {
      outline: 2px solid var(--kg-brand);
      outline-offset: 1px;
    }
    .df__day--out {
      color: var(--kg-placeholder);
    }
    .df__day--active {
      background: var(--kg-surface);
    }
    .df__day--today {
      border-color: var(--kg-line-strong);
    }
    .df__day--selected,
    .df__day--selected:hover {
      color: var(--kg-on-brand);
      background: var(--kg-brand-solid);
      border-color: var(--kg-brand-solid);
    }
  `,
})
export class DateField {
  protected readonly locale = inject(LocaleService);

  readonly value = input('');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly valueChange = output<string>();

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly typedEl = viewChild<ElementRef<HTMLInputElement>>('typedEl');
  private readonly popEl = viewChild<ElementRef<HTMLElement>>('popEl');

  protected readonly gridLabelId = `df-${uid++}`;
  protected readonly today = toIso(new Date());
  protected readonly open = signal(false);
  protected readonly pop = signal({ top: 0, left: 0 });
  /** First-of-month currently shown in the grid. */
  protected readonly viewMonth = signal(new Date());
  /** The day carrying roving focus / active highlight while the grid is open. */
  protected readonly focusedIso = signal(this.today);
  /** Contents of the typed-date field — always a full `dd/mm/yyyy` mask. */
  protected readonly typed = signal('');
  /** Segment being edited: 0 day, 1 month, 2 year. */
  private seg = 0;
  /** Digits entered into that segment since it was selected. */
  private segDigits = '';
  /** Fresh object per request so the focus effect always re-runs (nonce). */
  private readonly focusReq = signal<{ iso: string } | null>(null);

  protected readonly typedValid = computed(() => parseTyped(this.typed()) !== null);

  /** Trigger text, localised (e.g. "22 Jul 2026"); empty when unset. */
  protected readonly displayValue = computed(() => {
    const d = parseIso(this.value());
    return d
      ? new Intl.DateTimeFormat(this.locale.locale(), {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(d)
      : '';
  });

  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat(this.locale.locale(), { month: 'long', year: 'numeric' }).format(
      this.viewMonth(),
    ),
  );

  /** Sun→Sat headers, localised (4 Jan 1970 was a Sunday). */
  protected readonly weekdays = computed(() => {
    const shortF = new Intl.DateTimeFormat(this.locale.locale(), { weekday: 'short' });
    const longF = new Intl.DateTimeFormat(this.locale.locale(), { weekday: 'long' });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(1970, 0, 4 + i, 12);
      return { short: shortF.format(d), long: longF.format(d) };
    });
  });

  /** Six Sun-started weeks covering the view month (fixed height, no shift). */
  protected readonly weeks = computed<Cell[][]>(() => {
    const view = this.viewMonth();
    const month = view.getMonth();
    const start = new Date(view.getFullYear(), month, 1, 12);
    start.setDate(1 - start.getDay()); // back up to the Sunday on/before the 1st
    const rows: Cell[][] = [];
    for (let w = 0; w < 6; w++) {
      const row: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        row.push({ iso: toIso(start), day: start.getDate(), inMonth: start.getMonth() === month });
        start.setDate(start.getDate() + 1);
      }
      rows.push(row);
    }
    return rows;
  });

  constructor() {
    // Re-anchor the fixed popup while open (page scroll / window resize).
    effect((onCleanup) => {
      if (!this.open()) return;
      const reposition = () => this.positionPopup();
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      onCleanup(() => {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      });
    });
    // Focus the typed field when the popup opens; select its text for quick replace.
    effect(() => {
      if (!this.open()) return;
      this.positionPopup(); // re-anchor now the popup is rendered and has a real size
      const el = this.typedEl()?.nativeElement;
      if (el) {
        el.focus();
        this.focusSeg(0);
      }
    });
    // Move DOM focus onto a day when grid navigation requests it (nonce-driven).
    effect(() => {
      const req = this.focusReq();
      if (!this.open() || !req) return;
      this.root()
        .nativeElement.querySelector<HTMLElement>(`.df__day[data-iso="${req.iso}"]`)
        ?.focus();
    });
  }

  /** Full localised date for a day button's accessible name. */
  protected fullLabel(iso: string): string {
    const d = parseIso(iso)!;
    return new Intl.DateTimeFormat(this.locale.locale(), { dateStyle: 'full' }).format(d);
  }

  protected toggle(): void {
    this.open() ? this.close() : this.openCal();
  }

  private openCal(): void {
    const start = parseIso(this.value()) ?? new Date();
    this.viewMonth.set(new Date(start.getFullYear(), start.getMonth(), 1, 12));
    this.focusedIso.set(this.value() || this.today);
    // Prefilled, so the field is always a real date to edit rather than an
    // empty box to fill in; unset falls back to today, the day already ringed.
    this.typed.set(isoToTyped(this.value() || this.today));
    this.focusReq.set(null); // keep focus on the typed field, not a day
    this.positionPopup();
    this.open.set(true);
  }

  private close(): void {
    this.open.set(false);
  }

  private positionPopup(): void {
    this.pop.set(
      anchorPopup(
        this.trigger().nativeElement.getBoundingClientRect(),
        this.popEl()?.nativeElement,
      ),
    );
  }

  protected shiftMonth(delta: number): void {
    const v = this.viewMonth();
    this.viewMonth.set(new Date(v.getFullYear(), v.getMonth() + delta, 1, 12));
  }

  protected pick(iso: string): void {
    this.valueChange.emit(iso);
    this.close();
    this.trigger().nativeElement.focus();
  }

  /** Move the roving focus by `days`, following the grid across month edges. */
  private moveFocus(days: number): void {
    const d = parseIso(this.focusedIso())!;
    d.setDate(d.getDate() + days);
    this.jumpTo(toIso(d), true);
  }

  /** Show `iso` in the grid; `focus` also moves DOM focus onto its day. */
  private jumpTo(iso: string, focus: boolean): void {
    const d = parseIso(iso)!;
    this.focusedIso.set(iso);
    this.viewMonth.set(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    if (focus) this.focusReq.set({ iso });
  }

  /** Highlight segment `i` (clamped) and make it the target for typed digits. */
  protected focusSeg(i: number): void {
    this.seg = Math.min(Math.max(i, 0), SEGS.length - 1);
    this.segDigits = '';
    const [s, e] = SEGS[this.seg];
    this.typedEl()?.nativeElement.setSelectionRange(s, e);
  }

  /** Overwrite the current segment, keeping it highlighted for the next digit. */
  private writeSeg(text: string): void {
    const [s, e] = SEGS[this.seg];
    const next = this.typed().slice(0, s) + text + this.typed().slice(e);
    this.typed.set(next);
    const el = this.typedEl()?.nativeElement;
    if (el) {
      el.value = next;
      el.setSelectionRange(s, e);
    }
    const iso = parseTyped(next);
    if (iso) this.jumpTo(iso, false); // the grid follows what is being typed
  }

  /**
   * Fill the highlighted segment, moving on once it can hold nothing more: a
   * day starting 4-9 or a month starting 2-9 has to be the whole number, so it
   * hands over on the first digit. A second digit that would overflow (a 3 after
   * 1 in the month) starts the segment again rather than being dropped.
   */
  private typeDigit(d: string): void {
    if (this.seg === 2) {
      this.segDigits = (this.segDigits + d).slice(-4);
      this.writeSeg(this.segDigits.padStart(4, '0'));
      return;
    }
    const max = this.seg === 0 ? 31 : 12;
    if (this.segDigits !== '') {
      const both = +(this.segDigits + d);
      if (both >= 1 && both <= max) {
        this.segDigits += d;
        this.writeSeg(String(both).padStart(2, '0'));
        this.focusSeg(this.seg + 1);
        return;
      }
      this.segDigits = ''; // overflow: this digit opens the segment instead
    }
    this.segDigits = d;
    this.writeSeg('0' + d);
    if (+d * 10 > max) this.focusSeg(this.seg + 1);
  }

  /** Put the caret's segment under edit, so a click lands on month or year. */
  protected onTypedClick(el: HTMLInputElement): void {
    const at = el.selectionStart ?? 0;
    this.focusSeg(SEGS.findIndex(([, end]) => at <= end));
  }

  /** Keydown owns the digits, so this only sees paste and drop: take a whole
   *  date, and otherwise restore the mask the field is meant to hold. */
  protected onTypedInput(el: HTMLInputElement): void {
    const iso = parseTyped(el.value);
    if (iso) {
      this.typed.set(isoToTyped(iso));
      this.jumpTo(iso, false);
    }
    el.value = this.typed();
    this.focusSeg(0);
  }

  protected onTypedKeydown(e: KeyboardEvent): void {
    if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.typeDigit(e.key);
      return;
    }
    switch (e.key) {
      // The separators are already there — typing one just moves on, which is
      // what the habit of typing them was reaching for anyway.
      case '/':
      case '-':
      case '.':
      case 'ArrowRight':
        e.preventDefault();
        this.focusSeg(this.seg + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.focusSeg(this.seg - 1);
        break;
      case 'Backspace':
      case 'Delete':
        // Nothing to clear: the mask always holds a date. Re-open the segment,
        // then step back once it is already clean.
        e.preventDefault();
        this.focusSeg(this.segDigits === '' ? this.seg - 1 : this.seg);
        break;
      case 'Enter': {
        e.preventDefault();
        const iso = parseTyped(this.typed());
        if (iso) this.pick(iso);
        break;
      }
      case 'ArrowDown':
        e.preventDefault();
        this.focusReq.set({ iso: this.focusedIso() }); // hop into the grid
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        this.trigger().nativeElement.focus();
        break;
    }
  }

  protected onTriggerKeydown(e: KeyboardEvent): void {
    if (!this.open() && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.openCal();
    }
  }

  protected onGridKeydown(e: KeyboardEvent): void {
    const rtl = this.locale.dir() === 'rtl';
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.moveFocus(rtl ? 1 : -1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.moveFocus(rtl ? -1 : 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.moveFocus(-7);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.moveFocus(7);
        break;
      case 'Home':
        e.preventDefault();
        this.moveFocus(-parseIso(this.focusedIso())!.getDay());
        break;
      case 'End':
        e.preventDefault();
        this.moveFocus(6 - parseIso(this.focusedIso())!.getDay());
        break;
      case 'PageUp':
        e.preventDefault();
        this.moveFocus(-28);
        break;
      case 'PageDown':
        e.preventDefault();
        this.moveFocus(28);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.pick(this.focusedIso());
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        this.trigger().nativeElement.focus();
        break;
    }
  }

  /** Close when focus leaves the whole control (outside click / tab away). */
  protected onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (!next || !this.root().nativeElement.contains(next)) {
      this.close();
    }
  }
}
