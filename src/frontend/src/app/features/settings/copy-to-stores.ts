import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { Store } from '../../core/store/store.models';
import { StoreService } from '../../core/store/store.service';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * The user's other shops a copy may be offered to.
 *
 * Two doors, and which one a copy goes through decides what is worth offering. A **data**
 * copy — parties, items, conversion rates — needs `EDITOR` on the receiving end and an open
 * shop: `@CurrentStore(EDITOR)` refuses a viewer, and a shop the plan has closed takes no
 * writes at all. An **arrangement** copy — the menu, the sale grid — goes through
 * `PUT /settings`, which is owner-only and deliberately `allowLocked`, so a closed shop of
 * one's own is a perfectly good target: the app's layout is not the books.
 *
 * The backend refuses the wrong caller either way. This is only about not offering what would
 * fail, which is why one flag says both things at once rather than two that could disagree.
 */
export function copyTargets(stores: StoreService, arrangement = false): Store[] {
  return (stores.stores() ?? []).filter(
    (s) =>
      s.id !== stores.currentId() &&
      (arrangement
        ? s.role === 'OWNER'
        : !s.suspended && (s.role === 'OWNER' || s.role === 'EDITOR')),
  );
}

/**
 * "Copy this to my other shop" — the panel five settings screens open under their heading.
 *
 * A shop with branches sets its catalogue, its parties, its conversion rates, its menu and
 * its sale grid up once and pushes each to the rest, rather than retyping all five in every
 * branch. The screens differ only in what copying *means*, so that is all they pass in: the
 * hint that says it, and the function that does it.
 *
 * The panel owns which stores are ticked and how the attempt went; the parent owns only
 * whether it is open, and destroys it on {@link closed}. That is deliberate — a fresh panel
 * each time is what makes "open it again" a clean slate without any reset code.
 *
 * A copy is best-effort per store, so {@link copyTo} reports the ones it could not finish
 * rather than throwing: a partial run leaves the panel open with exactly those still ticked,
 * making a retry one click instead of a re-pick.
 */
@Component({
  selector: 'app-copy-to-stores',
  templateUrl: './copy-to-stores.html',
  // The buttons, the foot and the error line, shared with the screen this sits inside rather
  // than restated here; the panel's own card is the only thing this file styles.
  styleUrls: ['./settings-table.css', './copy-to-stores.css'],
})
export class CopyToStores {
  protected readonly locale = inject(LocaleService);
  private readonly stores = inject(StoreService);
  private readonly toast = inject(ToastService);

  /** What copying does here, in the shop's own words — the one line above the tick boxes. */
  readonly hint = input.required<TranslationKey>();
  /** True for the copies that go through `PUT /settings` — see {@link copyTargets}. */
  readonly arrangement = input(false);
  /** Does the copying, and answers with the stores it could not finish. */
  readonly copyTo = input.required<(ids: string[]) => Promise<string[]>>();
  /** Done with: cancelled, or copied everywhere it was asked to. */
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected readonly targets = computed(() => copyTargets(this.stores, this.arrangement()));
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly copying = signal(false);
  /** What the last attempt managed, shown only while some of it failed. */
  protected readonly failed = signal<{ ok: number; total: number } | null>(null);

  constructor() {
    // The button that opened this is hidden by the same click, so without moving focus in
    // here a keyboard user is left on <body> with the panel somewhere below them.
    afterNextRender(() => this.panel().nativeElement.focus());
  }

  protected toggle(id: string): void {
    this.picked.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected async copy(): Promise<void> {
    const ids = [...this.picked()];
    if (ids.length === 0) {
      return;
    }
    this.copying.set(true);
    this.failed.set(null);
    const failed = await this.copyTo()(ids);
    this.copying.set(false);
    const result = { ok: `${ids.length - failed.length}`, total: `${ids.length}` };
    if (failed.length === 0) {
      // Said in a toast rather than in the panel, because the panel is about to go: a copy
      // that worked leaves nothing to look at, and a silent close reads as nothing happened.
      this.toast.success(this.locale.t('settings.copy.result', result));
      this.closed.emit();
    } else {
      this.failed.set({ ok: ids.length - failed.length, total: ids.length });
      this.picked.set(new Set(failed));
    }
  }
}
