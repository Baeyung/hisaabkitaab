import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { anchorPopup } from '../anchor-popup';

/** Module-level counter so each instance gets a unique listbox/option id set. */
let uid = 0;

/**
 * Editable autocomplete combobox — the styled replacement for native `<datalist>`,
 * whose popup the browser draws with zero CSS hooks. Free-text is allowed: typing
 * a name not in `options` is valid (the entry screens match by name on save), the
 * list is only a suggestion aid.
 *
 * ARIA 1.2 editable-combobox pattern: input is role=combobox with aria-expanded /
 * aria-activedescendant driving a role=listbox of role=option items. Keyboard:
 * ↑/↓ move the active option, Enter picks it, Esc closes. Options use mousedown-
 * preventDefault so the click lands before the input's blur closes the list.
 */
@Component({
  selector: 'app-combobox',
  template: `
    <div class="cbx">
      <input
        #inputEl
        class="cbx__input"
        [class.cbx__input--sm]="small()"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        autocomplete="off"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? listboxId : null"
        [attr.aria-activedescendant]="open() && active() >= 0 ? optionId(active()) : null"
        [attr.id]="inputId()"
        [attr.aria-label]="ariaLabel()"
        [attr.placeholder]="placeholder()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="onInput($any($event.target).value)"
        (focus)="onFocus()"
        (blur)="open.set(false)"
        (keydown)="onKeydown($event)"
      />
      @if (open() && filtered().length) {
        <ul
          #list
          class="cbx__list"
          role="listbox"
          [attr.id]="listboxId"
          [style.top.px]="pop().top"
          [style.left.px]="pop().left"
          [style.min-width.px]="pop().width"
        >
          @for (opt of filtered(); track opt; let i = $index) {
            <li
              class="cbx__opt"
              [class.cbx__opt--active]="i === active()"
              role="option"
              [attr.id]="optionId(i)"
              [attr.aria-selected]="i === active()"
              (mousedown)="$event.preventDefault()"
              (click)="select(opt)"
            >
              {{ opt }}
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    /* Mirrors .fld__input from sale.css — encapsulation walls off the parent's
       copy, so the field primitive is duplicated here (same deferred ticket). */
    .cbx__input {
      height: 44px;
      padding: 0 13px;
      width: 100%;
      font-family: inherit;
      font-size: 15px;
      font-weight: 500;
      color: var(--kg-ink);
      background: var(--kg-card);
      border: 1px solid var(--kg-line-strong);
      border-radius: 10px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .cbx__input--sm {
      height: 40px;
    }
    .cbx__input:focus {
      outline: none;
      border-color: var(--kg-brand);
      box-shadow: 0 0 0 3px var(--kg-focus);
    }
    .cbx__input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .cbx__input::placeholder {
      color: var(--kg-placeholder);
      font-weight: 400;
    }
    /* position:fixed and anchored from the input's rect, exactly like .sel__pop:
       an absolute list is clipped by <main>'s scroll box and, on a phone, opens
       downward off the bottom with no way to reach it. anchorPopup() flips it
       above the field when there is no room below and keeps it on screen. */
    .cbx__list {
      position: fixed;
      z-index: 50;
      margin: 0;
      padding: 4px;
      list-style: none;
      width: max-content;
      max-width: min(90vw, 30ch);
      max-height: 240px;
      overflow-y: auto;
      background: var(--kg-card);
      border: 1px solid var(--kg-line-strong);
      border-radius: 10px;
      box-shadow: var(--kg-shadow-pop);
    }
    .cbx__opt {
      padding: 8px 10px;
      border-radius: 7px;
      cursor: pointer;
      font-size: 14px;
      color: var(--kg-ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cbx__opt--active,
    .cbx__opt:hover {
      background: var(--kg-surface);
    }
  `,
})
export class Combobox {
  readonly value = input('');
  readonly options = input<readonly string[]>([]);
  readonly placeholder = input('');
  readonly disabled = input(false);
  /** DOM id for the inner input, so an external `<label for>` still associates. */
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  /** Compact height for the grid rows (matches .fld__input--sm). */
  readonly small = input(false);
  readonly valueChange = output<string>();

  private readonly inputEl = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');
  private readonly list = viewChild<ElementRef<HTMLUListElement>>('list');

  protected readonly listboxId = `cbx-${uid++}`;
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  /** Viewport coords of the fixed list, kept in sync with the input's rect. */
  protected readonly pop = signal({ top: 0, left: 0, width: 0 });

  /** Case-insensitive substring match; whole list when empty. Capped so a large
   *  catalog doesn't render thousands of rows.
   *  ponytail: naive slice cap, add virtual scroll if lists ever get huge. */
  protected readonly filtered = computed(() => {
    const q = this.value().trim().toLowerCase();
    const opts = this.options();
    const matches = q ? opts.filter((o) => o.toLowerCase().includes(q)) : opts;
    return matches.slice(0, 50);
  });

  constructor() {
    // Re-anchor whenever the list appears or its height changes (typing filters
    // it, which can turn a downward list into a flipped one and back).
    effect(() => {
      if (this.open() && this.filtered().length) {
        this.positionPopup();
      }
    });
    // Keep it anchored while open: page scroll, window resize, keyboard open.
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }
      const reposition = () => this.positionPopup();
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      onCleanup(() => {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      });
    });
    // Keep the active option scrolled into view during keyboard nav.
    effect(() => {
      const i = this.active();
      if (!this.open() || i < 0) {
        return;
      }
      // The <li>s are the ul's only children, in `filtered()` order.
      (this.list()?.nativeElement.children[i] as HTMLElement | undefined)?.scrollIntoView({
        block: 'nearest',
      });
    });
  }

  /**
   * Put the caret in this box, selecting whatever is already in it.
   *
   * The entry grids call this to hand a line to the next one, and selecting means a shopkeeper
   * who lands on a prefilled box types over it rather than appending to it.
   */
  focus(): void {
    const el = this.inputEl().nativeElement;
    el.focus();
    el.select();
  }

  protected optionId(i: number): string {
    return `${this.listboxId}-opt-${i}`;
  }

  private positionPopup(): void {
    const r = this.inputEl().nativeElement.getBoundingClientRect();
    this.pop.set({ ...anchorPopup(r, this.list()?.nativeElement), width: r.width });
  }

  protected onInput(v: string): void {
    this.valueChange.emit(v);
    this.open.set(true);
    // Pre-highlight the top match so Enter takes it without arrowing down first.
    // Nothing typed = nothing presumed; no match leaves the raw string alone
    // (the Enter branch bails when the list is empty).
    this.active.set(v.trim() ? 0 : -1);
  }

  protected onFocus(): void {
    if (this.filtered().length) {
      this.open.set(true);
    }
  }

  protected select(opt: string): void {
    this.valueChange.emit(opt);
    this.open.set(false);
    this.active.set(-1);
    this.inputEl().nativeElement.focus();
  }

  protected onKeydown(e: KeyboardEvent): void {
    const items = this.filtered();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.open.set(true);
        this.active.set(items.length ? (this.active() + 1) % items.length : -1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.open.set(true);
        this.active.set(items.length ? (this.active() - 1 + items.length) % items.length : -1);
        break;
      case 'Enter':
        if (this.open() && this.active() >= 0 && this.active() < items.length) {
          e.preventDefault();
          this.select(items[this.active()]);
        }
        break;
      case 'Escape':
        if (this.open()) {
          e.preventDefault();
          this.open.set(false);
          this.active.set(-1);
        }
        break;
    }
  }
}
