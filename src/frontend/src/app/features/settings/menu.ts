import { Component, computed, inject, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { ChromeItem, MenuSetting, StoreSettings } from '../../core/store/store.models';
import { NAV, NavGroup, NavItem, NavLeaf, mergeMenu } from '../../layout/shell/nav';

/** The foot controls a shop may switch off, in the order the sidebar stacks them. */
const CHROME: ReadonlyArray<{ item: ChromeItem; label: TranslationKey }> = [
  { item: 'THEME', label: 'settings.menu.chrome.theme' },
  { item: 'INSTALL', label: 'settings.menu.chrome.install' },
  { item: 'PLAN', label: 'settings.menu.chrome.plan' },
];

/**
 * Store Settings › Menu — the shop's own arrangement of the app: what order the sidebar goes
 * in, what each entry is called, what is left out of it, and which of the foot's controls are
 * on.
 *
 * Owner-only and shop-wide: everybody working in the shop gets the menu the owner built, so a
 * shopkeeper can put the two screens they use all day at the top and lose the four they never
 * open. Role filtering still runs on top of it — see `mergeMenu` — so nothing arranged here
 * can show anyone a screen their role does not reach.
 *
 * Hiding is presentation, never permission. The routes stay reachable by typed URL exactly as
 * they are for the role filtering this sits beside; anyone treating a hidden menu entry as a
 * lock has misread it, which is what the note at the top of the page says.
 *
 * The whole menu is edited from {@link NAV}, not from what this owner currently sees, because
 * the arrangement is for the whole shop: a viewer's menu has no New Entry group, and the owner
 * still has to be able to order it. That NAV and `navFor('OWNER')` are the same list is not
 * an accident to lean on — OWNER is the top rank, so nothing is filtered from it.
 */
@Component({
  selector: 'app-settings-menu',
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './menu.html',
  // The page frame, buttons and fields, shared with Manage Users rather than copied again;
  // the switch, shared with General, which is the other screen that turns things on.
  styleUrls: ['./settings-table.css', './settings-switch.css', './menu.css'],
})
export class SettingsMenu {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);

  protected readonly chromeControls = CHROME;

  protected readonly saving = signal(false);
  protected readonly savedKey = signal<TranslationKey | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  /**
   * The whole menu, hidden entries included — this is the one screen that has to show what it
   * is hiding, or there would be no way to bring anything back.
   */
  protected readonly items = signal<NavItem[]>(mergeMenu(NAV, this.saved()?.menu));
  protected readonly hideChrome = signal<ReadonlySet<ChromeItem>>(
    new Set(this.saved()?.hideChrome ?? []),
  );

  /** How many entries are currently arranged out, for the line under the heading. */
  protected readonly hiddenCount = computed(
    () =>
      this.items().filter((item) => item.hidden).length +
      this.items().reduce(
        (n, item) => n + (item.kind === 'group' ? item.children.filter((c) => c.hidden).length : 0),
        0,
      ),
  );

  private saved(): StoreSettings | undefined {
    return this.stores.current()?.settings;
  }

  // ── reordering ──────────────────────────────────────────────────────
  // Two ways to do the same thing, on purpose. Dragging is what a shopkeeper reaches for;
  // the arrows are the only way that works from a keyboard, since cdkDrag has no keyboard
  // mode of its own. Neither is a fallback for the other — both are always there.

  protected drop(group: NavGroup | null, event: CdkDragDrop<unknown>): void {
    this.reorder(group, event.previousIndex, event.currentIndex);
  }

  protected nudge(group: NavGroup | null, index: number, delta: -1 | 1): void {
    this.reorder(group, index, index + delta);
  }

  private reorder(group: NavGroup | null, from: number, to: number): void {
    const rows = group ? group.children : this.items();
    if (to < 0 || to >= rows.length || from === to) {
      return;
    }
    this.touch();
    if (group) {
      this.items.update((items) =>
        items.map((item) => {
          if (item.key !== group.key || item.kind !== 'group') {
            return item;
          }
          const children = [...item.children];
          moveItemInArray(children, from, to);
          return { ...item, children };
        }),
      );
      return;
    }
    this.items.update((items) => {
      const next = [...items];
      moveItemInArray(next, from, to);
      return next;
    });
  }

  // ── naming and hiding ───────────────────────────────────────────────

  /**
   * Kept exactly as typed, and only trimmed on the way out (see {@link toSettings}). The box
   * is bound one-way to this value, so normalising here would rewrite what someone is in the
   * middle of typing — a leading space would vanish from under the caret.
   */
  protected rename(group: NavGroup | null, key: TranslationKey, event: Event): void {
    this.patch(group, key, { label: (event.target as HTMLInputElement).value });
  }

  protected setShown(group: NavGroup | null, key: TranslationKey, event: Event): void {
    this.patch(group, key, { hidden: !(event.target as HTMLInputElement).checked });
  }

  protected setChrome(item: ChromeItem, event: Event): void {
    const shown = (event.target as HTMLInputElement).checked;
    this.touch();
    this.hideChrome.update((hidden) => {
      const next = new Set(hidden);
      shown ? next.delete(item) : next.add(item);
      return next;
    });
  }

  protected chromeShown(item: ChromeItem): boolean {
    return !this.hideChrome().has(item);
  }

  /**
   * Replace one row's arranged fields, at the top level or inside a group, leaving the rest
   * of the menu untouched. A patch object rather than a mapping function so the spread keeps
   * each row's own type — a top-level row is a link or a group, a child is neither.
   */
  private patch(
    group: NavGroup | null,
    key: TranslationKey,
    change: Pick<Partial<NavLeaf>, 'label' | 'hidden'>,
  ): void {
    this.touch();
    this.items.update((items) =>
      items.map((item) => {
        if (group === null) {
          return item.key === key ? { ...item, ...change } : item;
        }
        if (item.key !== group.key || item.kind !== 'group') {
          return item;
        }
        return {
          ...item,
          children: item.children.map((child) =>
            child.key === key ? { ...child, ...change } : child,
          ),
        };
      }),
    );
  }

  /** Back to the menu the app ships with. Local until saved, like every other edit here. */
  protected reset(): void {
    this.touch();
    this.items.set(mergeMenu(NAV, []));
    this.hideChrome.set(new Set());
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      await this.stores.updateSettings(this.toSettings());
      this.savedKey.set('settings.menu.saved');
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * The arrangement as it goes to the server: every entry, in order, whether hidden or not.
   * Written in full rather than as a diff from the defaults — the order is only meaningful
   * as a whole list, and a partial one would have to be merged against a default that may
   * have changed underneath it.
   */
  private toSettings(): StoreSettings {
    // Structural, not NavLeaf: a group carries the same three arranged fields but no path.
    const row = (item: Pick<NavLeaf, 'key' | 'hidden' | 'label'>): MenuSetting => ({
      key: item.key,
      hidden: item.hidden === true,
      // Blank is not a name — it means "use the built-in one". Trimmed here rather than as
      // it is typed, so the box never edits itself while someone is in it.
      label: item.label?.trim() || undefined,
    });
    return {
      menu: this.items().map((item) =>
        item.kind === 'group' ? { ...row(item), children: item.children.map(row) } : row(item),
      ),
      hideChrome: [...this.hideChrome()],
      // Carried through untouched. The endpoint replaces the whole document, and this screen
      // does not edit how the shop navigates — General does. Rebuilding the document without
      // it would switch a counter shop back to the sidebar on the next menu save.
      easyMode: this.saved()?.easyMode === true,
      // The same, for the same reason: Reports owns this, and arranging the sidebar must not
      // be what silently switches a shop's nightly report and khata reminders back off.
      reports: this.saved()?.reports,
    };
  }

  /** Any fresh edit supersedes the last "saved" confirmation. */
  private touch(): void {
    this.savedKey.set(null);
  }
}
