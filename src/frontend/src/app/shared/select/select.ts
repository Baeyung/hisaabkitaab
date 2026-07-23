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

export interface SelectOption {
  value: string;
  label: string;
}

/** Module-level counter so each instance gets a unique listbox/option id set. */
let uid = 0;

/**
 * Searchable single-select dropdown — the fully-themed replacement for a native
 * `<select>` in the filter toolbars, whose open list the browser draws with zero
 * CSS hooks. Popup, search field, and options share the visual language of
 * {@link Combobox}.
 *
 * Pick-from-list only (no free text): `value` holds an option's `value` (an id or
 * `''` for the "all" row) and `valueChange` emits the chosen one. Opening reveals
 * a search input that filters options by label — the point of difference from a
 * plain select. ARIA 1.2 editable-combobox pattern: the search input is
 * `role=combobox` with aria-expanded / aria-activedescendant driving a
 * `role=listbox`. Keyboard: type to filter, ↑/↓ move the active option, Enter
 * picks it, Esc closes. Options use mousedown-preventDefault so the click lands
 * before focus leaves; focus moving outside the control closes the popup.
 */
@Component({
  selector: 'app-select',
  template: `
    <div #root class="sel" (focusout)="onFocusOut($event)">
      <button
        #trigger
        type="button"
        class="sel__btn"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="ariaLabel()"
        [disabled]="disabled()"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        <span class="sel__val" [class.sel__val--ph]="!selectedLabel()">{{
          selectedLabel() || placeholder()
        }}</span>
        <svg
          class="sel__chev"
          [class.sel__chev--open]="open()"
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
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      @if (open()) {
        <div
          #popEl
          class="sel__pop"
          [style.top.px]="pop().top"
          [style.left.px]="pop().left"
          [style.min-width.px]="pop().width"
        >
          <input
            #search
            class="sel__search"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            autocomplete="off"
            aria-expanded="true"
            [attr.aria-controls]="listboxId"
            [attr.aria-activedescendant]="active() >= 0 ? optionId(active()) : null"
            [attr.aria-label]="ariaLabel()"
            [value]="query()"
            [attr.placeholder]="locale.t('filter.search.ph')"
            (input)="onSearch($any($event.target).value)"
            (keydown)="onKeydown($event)"
          />
          @if (filtered().length) {
            <ul #list class="sel__list" role="listbox" [attr.id]="listboxId">
              @for (opt of filtered(); track opt.value; let i = $index) {
                <li
                  class="sel__opt"
                  [class.sel__opt--active]="i === active()"
                  [class.sel__opt--selected]="opt.value === value()"
                  role="option"
                  [attr.id]="optionId(i)"
                  [attr.aria-selected]="opt.value === value()"
                  (mousedown)="$event.preventDefault()"
                  (click)="select(opt)"
                >
                  {{ opt.label }}
                </li>
              }
            </ul>
          } @else {
            <p class="sel__none">{{ locale.t('filter.search.none') }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .sel {
      position: relative;
    }
    /* Mirrors select.rm-input from styles.css so the closed control is
       indistinguishable from a native filter select. */
    .sel__btn {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      width: 100%;
      max-width: 340px;
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
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .sel__btn:hover:not(:focus):not(:disabled) {
      border-color: var(--kg-brand);
    }
    .sel__btn:focus {
      outline: none;
      border-color: var(--kg-brand);
      box-shadow: 0 0 0 3px var(--kg-focus);
    }
    .sel__btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .sel__val {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .sel__val--ph {
      color: #b6afa4;
      font-weight: 400;
    }
    .sel__chev {
      flex-shrink: 0;
      color: var(--kg-faint);
      transition: transform 0.15s ease, color 0.15s ease;
    }
    .sel__btn:focus .sel__chev {
      color: var(--kg-brand);
    }
    .sel__chev--open {
      transform: rotate(180deg);
    }
    /* Mirrors .cbx__list from combobox.ts, with a pinned search field on top.
       position:fixed so the card's overflow:hidden can't clip it; anchored to
       the trigger via inline top/left/width bound from its rect. */
    .sel__pop {
      position: fixed;
      z-index: 50;
      /* Grow to fit the longest name up to ~30 chars, then options ellipsize;
         never narrower than the trigger (min-width bound inline). */
      width: max-content;
      max-width: min(90vw, 30ch);
      padding: 4px;
      background: var(--kg-card);
      border: 1px solid var(--kg-line-strong);
      border-radius: 10px;
      box-shadow: 0 12px 30px rgba(35, 32, 28, 0.16);
    }
    .sel__search {
      width: 100%;
      height: 38px;
      padding: 0 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      color: var(--kg-ink);
      background: var(--kg-surface);
      border: 1px solid var(--kg-line-strong);
      border-radius: 7px;
    }
    .sel__search:focus {
      outline: none;
      border-color: var(--kg-brand);
    }
    .sel__search::placeholder {
      color: #b6afa4;
      font-weight: 400;
    }
    .sel__list {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
      max-height: 240px;
      overflow-y: auto;
    }
    .sel__opt {
      padding: 8px 10px;
      border-radius: 7px;
      cursor: pointer;
      font-size: 14px;
      color: var(--kg-ink);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sel__opt--active,
    .sel__opt:hover {
      background: var(--kg-surface);
    }
    .sel__opt--selected {
      font-weight: 600;
      color: var(--kg-brand);
    }
    .sel__none {
      margin: 4px 0 0;
      padding: 8px 10px;
      font-size: 14px;
      color: var(--kg-faint);
    }
  `,
})
export class Select {
  protected readonly locale = inject(LocaleService);

  readonly options = input<readonly SelectOption[]>([]);
  readonly value = input('');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly valueChange = output<string>();

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly list = viewChild<ElementRef<HTMLUListElement>>('list');
  private readonly popEl = viewChild<ElementRef<HTMLElement>>('popEl');

  protected readonly listboxId = `sel-${uid++}`;
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly query = signal('');
  /** Viewport coords of the fixed popup, kept in sync with the trigger's rect. */
  protected readonly pop = signal({ top: 0, left: 0, width: 0 });

  /** Case-insensitive substring match on the label; whole list when empty. */
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const opts = this.options();
    return q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts.slice();
  });

  protected selectedLabel(): string {
    return this.options().find((o) => o.value === this.value())?.label ?? '';
  }

  constructor() {
    // Move focus into the search field once the popup renders.
    effect(() => {
      if (this.open()) {
        this.positionPopup(); // re-anchor now the popup is rendered and has a real size
        this.search()?.nativeElement.focus();
      }
    });
    // Re-anchor the fixed popup while it's open (page scroll / window resize).
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
      this.list()
        ?.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(this.optionId(i))}`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  protected optionId(i: number): string {
    return `${this.listboxId}-opt-${i}`;
  }

  protected toggle(): void {
    this.open() ? this.close() : this.openList();
  }

  private openList(): void {
    this.query.set('');
    // Highlight the current selection so keyboard nav starts from it.
    this.active.set(this.options().findIndex((o) => o.value === this.value()));
    this.positionPopup();
    this.open.set(true);
  }

  private positionPopup(): void {
    const r = this.trigger().nativeElement.getBoundingClientRect();
    this.pop.set({ ...anchorPopup(r, this.popEl()?.nativeElement), width: r.width });
  }

  private close(): void {
    this.open.set(false);
    this.active.set(-1);
  }

  protected select(opt: SelectOption): void {
    this.valueChange.emit(opt.value);
    this.close();
    this.trigger().nativeElement.focus();
  }

  protected onSearch(v: string): void {
    this.query.set(v);
    // Auto-highlight the top match so Enter picks it without an extra arrow key.
    this.active.set(this.filtered().length ? 0 : -1);
  }

  /** Close when focus leaves the whole control (outside click / tab away). */
  protected onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (!next || !this.root().nativeElement.contains(next)) {
      this.close();
    }
  }

  protected onTriggerKeydown(e: KeyboardEvent): void {
    if (!this.open() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      this.openList();
    }
  }

  protected onKeydown(e: KeyboardEvent): void {
    const items = this.filtered();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.active.set(items.length ? (this.active() + 1) % items.length : -1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.active.set(items.length ? (this.active() - 1 + items.length) % items.length : -1);
        break;
      case 'Enter':
        if (this.active() >= 0) {
          e.preventDefault();
          this.select(items[this.active()]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        this.trigger().nativeElement.focus();
        break;
    }
  }
}
