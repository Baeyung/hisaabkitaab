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
        <ul #list class="cbx__list" role="listbox" [attr.id]="listboxId">
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
    .cbx {
      position: relative;
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
      color: #b6afa4;
      font-weight: 400;
    }
    .cbx__list {
      position: absolute;
      z-index: 20;
      top: calc(100% + 4px);
      inset-inline: 0;
      margin: 0;
      padding: 4px;
      list-style: none;
      max-height: 240px;
      overflow-y: auto;
      background: var(--kg-card);
      border: 1px solid var(--kg-line-strong);
      border-radius: 10px;
      box-shadow: 0 12px 30px rgba(35, 32, 28, 0.16);
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
    // Keep the active option scrolled into view during keyboard nav.
    effect(() => {
      const i = this.active();
      if (!this.open() || i < 0) {
        return;
      }
      this.list()
        ?.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(this.optionId(i))}`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  protected optionId(i: number): string {
    return `${this.listboxId}-opt-${i}`;
  }

  protected onInput(v: string): void {
    this.valueChange.emit(v);
    this.open.set(true);
    this.active.set(-1);
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
        if (this.open() && this.active() >= 0) {
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
