import { Component, ElementRef, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { StoreService } from '../../core/store/store.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { ChromeItem } from '../../core/store/store.models';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';
import { InstallButton } from '../../shared/install-button/install-button';
import { NavIconMark } from '../../shared/nav-icon/nav-icon';
import { arranged } from '../../layout/shell/nav';
import {
  BoardBand,
  BoardTab,
  BoardTile,
  EASY_NAV,
  boardFor,
  openSheet,
} from '../../layout/shell/board';

/**
 * The board — easy mode's home, and the whole of its navigation.
 *
 * A shop turns this on from Store Settings › General when the app lives on the counter
 * rather than on somebody's desk: a tablet the whole shop shares, or a keyboard and a screen
 * beside the till. The sidebar is a list you read; this is a surface you aim at. Every button
 * goes to a screen that already exists — nothing here is a second implementation of anything,
 * and nothing here is a permission. `boardFor` builds it from the same arranged menu the
 * sidebar draws, so hiding an entry hides its button and renaming one renames it.
 *
 * The tab is in the URL rather than in a field, so the browser's Back button comes back to
 * the sheet you left from. That is the loop this screen is built around: press 2, record a
 * receipt, press Back, you are looking at Entry again with your finger over the same key.
 *
 * Arriving with no `?tab=` at all — the topbar's Menu button, a bookmark of the shop, the
 * morning's first load — opens the sheet this browser left open last, and puts it in the URL
 * on the way. A counter tablet is one shop doing one kind of work all day; sending it back to
 * the first tab every time is a tap the same person pays over and over.
 */
@Component({
  selector: 'app-easy-board',
  imports: [RouterLink, LanguageToggle, ThemeToggle, InstallButton, NavIconMark],
  templateUrl: './easy-board.html',
  styleUrl: './easy-board.css',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class EasyBoard {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Which sheet is open, bound straight off `?tab=` by withComponentInputBinding. */
  readonly tab = input<string>();

  /**
   * The board this shop arranged, or the one the app ships with until it arranges one.
   *
   * Its own document and its own shipped table, kept apart from the sidebar's on purpose: the
   * two are different shapes for different rooms, and a shop that switches between them finds
   * each as it left it. Three levels deep because that is what a board is — tab, band, button.
   */
  protected readonly tabs = computed(() =>
    boardFor(arranged(this.stores.role(), this.stores.current()?.settings?.easyMenu, EASY_NAV, 3)),
  );

  /**
   * The open sheet — see `openSheet` for which of the three claims wins.
   *
   * The remembered tab is read here and not only in the effect below so the right sheet is
   * drawn on the first frame: waiting for the URL to be rewritten would show tab one first
   * and then swap it out from under the finger already moving towards it.
   */
  protected readonly active = computed(() => openSheet(this.tabs(), this.tab(), this.remembered()));

  /**
   * Where the keyboard is on the tab strip, which is not the same as which sheet is open:
   * the arrow keys walk the strip and Enter opens what they land on (ARIA's manual-activation
   * tablist). Automatic activation would fire a navigation on every arrow press, and each of
   * those is a URL the Back button then has to be pressed through.
   */
  protected readonly focused = signal(0);

  /**
   * Which of the rail's controls this shop shows — the same setting the sidebar foot reads,
   * because in easy mode this rail *is* that foot. The language switcher is deliberately not
   * among them and never should be: it is the way out of a language you cannot read.
   */
  protected readonly chrome = computed(() => {
    const hidden = new Set<ChromeItem>(this.stores.current()?.settings?.hideChrome ?? []);
    return { theme: !hidden.has('THEME'), install: !hidden.has('INSTALL') };
  });

  constructor() {
    // Keep the strip's focus on the open sheet when it changes from anywhere else — a link,
    // the Back button, the topbar's Menu button.
    effect(() => {
      const open = this.active();
      const index = open ? this.tabs().indexOf(open) : -1;
      if (index >= 0) {
        this.focused.set(index);
      }
    });

    // Keep `?tab=` and the remembered sheet agreeing with what is on screen. The URL is what
    // actually decides which sheet is open — every link, bookmark and Back press carries it —
    // so an arrival without one is answered by writing the remembered tab *into* the address
    // rather than by opening it quietly behind an address that says otherwise. Replacing the
    // entry, not adding one, for the same reason `open()` does: the sheet the shopkeeper came
    // from must stay one Back press away, not two.
    effect(() => {
      const open = this.active();
      if (!open) {
        return;
      }
      this.remember(open.key);
      if (open.key !== this.tab()) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { tab: open.key },
          replaceUrl: true,
        });
      }
    });
  }

  // ── the sheet this browser left open ────────────────────────────────

  /**
   * Per shop, because two shops are two different boards: the same login can be at a till in
   * one and doing the books in another, and one of them remembering the other's tab is worse
   * than neither remembering anything. Per browser rather than on the shop, too — this is
   * where *this* device was left, not a setting anybody chose for everyone.
   */
  private tabStorageKey(): string | null {
    const store = this.stores.currentId();
    return store ? `hk.board.tab.${store}` : null;
  }

  private remembered(): string | null {
    const key = this.tabStorageKey();
    return key ? localStorage.getItem(key) : null;
  }

  private remember(tab: string): void {
    const key = this.tabStorageKey();
    if (key) {
      localStorage.setItem(key, tab);
    }
  }

  protected label(tile: BoardTile): string {
    return tile.label || this.locale.t(tile.key);
  }

  /**
   * What a tab or a band is called: the shop's own word for it, or the built-in one. A band a
   * shop assembled itself has only the name it typed, which is why this goes through
   * `navLabel` rather than translating the key — there is nothing to translate.
   */
  protected heading(part: BoardTab | BoardBand): string {
    return this.locale.navLabel({ key: part.key ?? '', label: part.label });
  }

  /** Offered but not usable: it records something, and the plan has this shop closed. */
  protected blocked(tile: BoardTile): boolean {
    return tile.writes === true && !this.stores.canEdit();
  }

  /**
   * Switching sheets replaces the history entry rather than adding one: the tab is in the URL
   * so Back returns from a *screen* to the sheet it was opened from, and stacking every tab
   * press in front of that would bury it.
   */
  protected open(key: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: key },
      replaceUrl: true,
    });
  }

  // ── the tab strip ───────────────────────────────────────────────────

  /**
   * Arrow keys walk the strip, Home and End jump to its ends, and both wrap. The step is
   * flipped under Urdu: the strip is laid out on the inline axis, so its first tab is the
   * rightmost one and "right" has to mean "back" or the keys fight the page.
   */
  protected onStripKey(event: KeyboardEvent): void {
    const count = this.tabs().length;
    const back = this.locale.dir() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const forward = this.locale.dir() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';

    const to =
      event.key === back
        ? (this.focused() - 1 + count) % count
        : event.key === forward
          ? (this.focused() + 1) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : -1;

    if (to < 0) {
      return;
    }
    event.preventDefault();
    this.focused.set(to);
    this.tabEl(to)?.focus();
  }

  private tabEl(index: number): HTMLElement | null {
    return (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-tab-index="${index}"]`,
    );
  }

  // ── number keys ─────────────────────────────────────────────────────

  /**
   * 1–9 open the button carrying that number on the open sheet.
   *
   * This is what "easy mode" is for at a counter: the shopkeeper's hand never leaves the
   * number pad between one entry and the next. The board is the only screen that takes the
   * digits, and only while nothing else wants them — a modifier means the browser or the OS
   * is being addressed, and a focused field means the person is typing, not aiming.
   */
  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) {
      return;
    }
    const digit = Number(event.key);
    if (!digit || digit > 9) {
      return;
    }
    const tile = this.active()
      ?.bands.flatMap((band) => band.tiles)
      .find((t) => t.digit === digit);
    if (!tile || this.blocked(tile)) {
      return;
    }
    event.preventDefault();
    void this.router.navigate(this.stores.link(tile.path));
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
