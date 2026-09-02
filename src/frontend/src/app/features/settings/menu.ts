import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { anchorPopup } from '../../shared/anchor-popup';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { ChromeItem, MenuSetting, StoreSettings } from '../../core/store/store.models';
import {
  NAV,
  NavGroup,
  NavItem,
  NavLink,
  customKey,
  isCustomGroup,
  mergeMenu,
} from '../../layout/shell/nav';
import { ToastService } from '../../shared/toast/toast.service';

/** The foot controls a shop may switch off, in the order the sidebar stacks them. */
const CHROME: ReadonlyArray<{ item: ChromeItem; label: TranslationKey }> = [
  { item: 'THEME', label: 'settings.menu.chrome.theme' },
  { item: 'INSTALL', label: 'settings.menu.chrome.install' },
  { item: 'PLAN', label: 'settings.menu.chrome.plan' },
];

/**
 * Store Settings › Menu — the shop's own arrangement of the app: what order the sidebar goes
 * in, what is grouped with what, what each entry is called, what is left out of it, and which
 * of the foot's controls are on.
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
 * ## Grouping
 *
 * The built-in groups are a starting point, not a shape a shop is stuck inside. Any entry can
 * be moved out of its group, onto the top level, or into a group the shop made for itself —
 * a "Counter" holding Sale and Bill Management is exactly the arrangement the shipped menu
 * cannot express, and it is the one a shopkeeper asks for first. A group only ever holds
 * plain entries: one level of nesting is what the sidebar draws, so it is all this offers.
 *
 * Two jobs, two controls, and they do not overlap. Dragging and the up/down arrows reorder a
 * row **within the list it is already in**; the move button beside them is how a row changes
 * list, and it asks where to go rather than guessing — top level, any group by name, or a new
 * group made on the spot.
 *
 * Dragging between lists is deliberately not offered. The sub-lists are nested inside the
 * top-level `cdkDropList`, and `CdkDropList` provides `CDK_DROP_LIST_GROUP: undefined` to its
 * own subtree, so a nested list can never join the enclosing `cdkDropListGroup` — cross-list
 * drag simply does not arrive, whatever the markup says. Wiring the two together by hand with
 * `cdkDropListConnectedTo` gets an entry *into* a group, but not back out: the top-level list
 * geometrically contains every well, so `_canReceive` claims the pointer the moment it enters
 * one and the row pops out of the group it is being sorted inside. A gesture that works one
 * way is worse than a button that works both, so the button is the only way a row changes
 * list, and it is also the only way that works from a keyboard.
 *
 * The whole menu is edited from {@link NAV}, not from what this owner currently sees, because
 * the arrangement is for the whole shop: a viewer's menu has no New Entry group, and the owner
 * still has to be able to order it. That NAV and `navFor('OWNER')` are the same list is not
 * an accident to lean on — OWNER is the top rank, so nothing is filtered from it.
 */
@Component({
  selector: 'app-settings-menu',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, NgTemplateOutlet],
  templateUrl: './menu.html',
  // The page frame, buttons and fields, shared with Manage Users rather than copied again;
  // the switch, shared with General, which is the other screen that turns things on.
  styleUrls: ['./settings-table.css', './settings-switch.css', './menu.css'],
})
export class SettingsMenu {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);

  protected readonly chromeControls = CHROME;

  protected readonly saving = signal(false);
  /** Set by the first save attempt, so the unnamed-group warning appears then and not while typing. */
  protected readonly attempted = signal(false);

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

  /**
   * Groups the shop made and has not named. A blank name is the one thing this screen will not
   * save: `mergeMenu` dissolves such a group on the way back in, so saving it would quietly
   * throw the grouping away rather than keep it.
   */
  protected readonly unnamed = computed(() =>
    this.items().filter((item) => this.isBlankGroup(item)),
  );

  private saved(): StoreSettings | undefined {
    return this.stores.current()?.settings;
  }

  // ── what a row is ───────────────────────────────────────────────────

  protected isCustom(item: NavItem): boolean {
    return item.kind === 'group' && isCustomGroup(item.key);
  }

  protected isBlankGroup(item: NavItem): boolean {
    return this.isCustom(item) && !item.label?.trim();
  }

  /**
   * A group holding a screen that may not be hidden cannot be hidden either — otherwise
   * dragging Menu into a group of your own and switching that group off would be the way
   * around the lock. Mirrors the same rule in `mergeMenu`, which is where it actually binds.
   */
  protected locksMenu(item: NavItem): boolean {
    return (
      item.locked === true || (item.kind === 'group' && item.children.some((child) => child.locked))
    );
  }

  /** What to call a row: the shop's name, the built-in one, or — for a new group — neither yet. */
  protected name(item: NavItem): string {
    return this.locale.navLabel(item) || this.locale.t('settings.menu.newGroup');
  }

  /** The built-in name sits in the placeholder; a group the shop made is asking to be named. */
  protected placeholder(item: NavItem): string {
    return this.isCustom(item)
      ? this.locale.t('settings.menu.groupName')
      : this.locale.t(item.key as TranslationKey);
  }

  /** Every list a row could be moved into, in the order the menu draws them. */
  protected readonly groups = computed(() =>
    this.items().filter((item): item is NavGroup => item.kind === 'group'),
  );

  // ── moving ──────────────────────────────────────────────────────────

  /**
   * What a drop list carries: the group it holds, or null for the top level. Both lists are
   * typed the same on purpose — a drop can go from either to either, and the handler below
   * is where the two meet.
   */
  protected readonly topList: NavGroup | null = null;

  protected listOf(item: NavItem): NavGroup | null {
    return item.kind === 'group' ? item : null;
  }

  protected drop(event: CdkDragDrop<NavGroup | null>): void {
    this.move(
      event.previousContainer.data?.key ?? null,
      event.previousIndex,
      event.container.data?.key ?? null,
      event.currentIndex,
    );
  }

  protected nudge(group: NavGroup | null, index: number, delta: -1 | 1): void {
    const rows = group ? group.children : this.items();
    const to = index + delta;
    if (to < 0 || to >= rows.length) {
      return;
    }
    this.move(group?.key ?? null, index, group?.key ?? null, to);
  }

  // ── moving between lists ────────────────────────────────────────────

  /**
   * The row whose destinations are on screen: what is moving, the list it is in now, and
   * where it sits in that list. One at a time, and held here rather than per row, so there is
   * a single popup to place and a single thing to close.
   */
  protected readonly moving = signal<{
    item: NavItem;
    from: NavGroup | null;
    index: number;
  } | null>(null);

  /** Viewport coords of the fixed popup, kept against the button that opened it. */
  protected readonly movePop = signal({ top: 0, left: 0 });
  private readonly movePopEl = viewChild<ElementRef<HTMLElement>>('movePopEl');
  private moveTrigger: HTMLElement | null = null;

  protected openMove(item: NavItem, from: NavGroup | null, index: number, event: Event): void {
    this.moveTrigger = event.currentTarget as HTMLElement;
    this.moving.set({ item, from, index });
    // Anchored twice: once off the bare button, since the popup is not in the DOM to be
    // measured yet, and again once it is — which is the placement that actually lands.
    this.movePop.set(anchorPopup(this.moveTrigger.getBoundingClientRect(), null));
    afterNextRender(
      () => {
        const pop = this.movePopEl()?.nativeElement;
        if (pop && this.moveTrigger) {
          this.movePop.set(anchorPopup(this.moveTrigger.getBoundingClientRect(), pop));
        }
        pop?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
      },
      { injector: this.injector },
    );
  }

  /** Focus goes back to the button that opened it — a popup that closes must hand focus back. */
  protected closeMove(): void {
    if (!this.moving()) {
      return;
    }
    this.moving.set(null);
    this.moveTrigger?.focus();
    this.moveTrigger = null;
  }

  /**
   * Into a group, a row lands at the end of it — the well is short, so it is in plain sight
   * either way. Out to the top level it lands immediately below the group it left, not at the
   * foot of the whole menu, which is somewhere the eye is not and probably off the screen.
   */
  protected moveTo(toKey: string | null): void {
    const from = this.moving();
    if (!from) {
      return;
    }
    const to =
      toKey === null
        ? this.items().findIndex((item) => item.key === from.from?.key) + 1
        : (this.group(toKey)?.children.length ?? 0);
    this.move(from.from?.key ?? null, from.index, toKey, to);
    this.closeMove();
  }

  /**
   * A group made for this move, named on the spot. The group lands at the foot of the menu
   * with the row already inside it, and the caret goes to its name box — an unnamed group is
   * the one thing that stops a save, so asking for the name immediately is the whole point.
   */
  protected moveToNewGroup(): void {
    const from = this.moving();
    if (!from) {
      return;
    }
    const key = customKey();
    this.items.update((items) => [
      ...items,
      { kind: 'group', key, icon: 'menu', label: '', hidden: false, children: [] },
    ]);
    this.move(from.from?.key ?? null, from.index, key, 0);
    this.moving.set(null);
    this.moveTrigger = null;
    this.focusRow(key);
  }

  protected group(key: string): NavGroup | undefined {
    return this.groups().find((g) => g.key === key);
  }

  /**
   * Take one row out of where it is and put it where it is going. The single edit every move
   * on this screen is written in — dragging, the arrows, and dissolving a group all end up
   * here, so the rules about what may sit where are stated once.
   */
  private move(
    fromKey: string | null,
    fromIndex: number,
    toKey: string | null,
    toIndex: number,
  ): void {
    this.items.update((items) => {
      // Every group gets a fresh children array, so nothing downstream is holding the array
      // this is about to splice.
      const next: NavItem[] = items.map((item) =>
        item.kind === 'group' ? { ...item, children: [...item.children] } : item,
      );
      const listOf = (key: string | null): NavItem[] | undefined =>
        key === null
          ? next
          : next.find((item): item is NavGroup => item.kind === 'group' && item.key === key)
              ?.children;

      const from = listOf(fromKey);
      const to = listOf(toKey);
      const row = from?.[fromIndex];
      // A group has nowhere to go but the top level. The drag predicate and the disabled
      // arrows already say so; this is what makes it true rather than merely discouraged.
      if (!from || !to || !row || (toKey !== null && row.kind === 'group')) {
        return items;
      }
      from.splice(fromIndex, 1);
      to.splice(Math.min(toIndex, to.length), 0, row);
      return next;
    });
  }

  // ── groups the shop makes ───────────────────────────────────────────

  /**
   * A new, empty, unnamed group at the foot of the list, with the cursor in its name box —
   * naming it is the first thing to do, and the only thing that stops the save.
   */
  protected addGroup(): void {
    const key = customKey();
    this.items.update((items) => [
      ...items,
      { kind: 'group', key, icon: 'menu', label: '', hidden: false, children: [] },
    ]);
    this.focusRow(key);
  }

  /** The caret into a row's name box once it has rendered. */
  private focusRow(key: string): void {
    afterNextRender(() => document.getElementById(`row-${key}`)?.focus({ preventScroll: false }), {
      injector: this.injector,
    });
  }

  /**
   * Take the group away and leave its entries behind, in its place. Nothing is lost, so
   * nothing is confirmed — a group is a heading, and this removes the heading.
   */
  protected removeGroup(group: NavGroup): void {
    this.items.update((items) =>
      items.flatMap<NavItem>((item) => (item.key === group.key ? group.children : [item])),
    );
  }

  // ── naming and hiding ───────────────────────────────────────────────

  /**
   * Kept exactly as typed, and only trimmed on the way out (see {@link toSettings}). The box
   * is bound one-way to this value, so normalising here would rewrite what someone is in the
   * middle of typing — a leading space would vanish from under the caret.
   */
  protected rename(group: NavGroup | null, key: string, event: Event): void {
    this.patch(group, key, { label: (event.target as HTMLInputElement).value });
  }

  protected setShown(group: NavGroup | null, key: string, event: Event): void {
    this.patch(group, key, { hidden: !(event.target as HTMLInputElement).checked });
  }

  protected setChrome(item: ChromeItem, event: Event): void {
    const shown = (event.target as HTMLInputElement).checked;
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
   * each row's own type — a top-level row is a link or a group, a child is always a link.
   */
  private patch(
    group: NavGroup | null,
    key: string,
    change: Pick<Partial<NavLink>, 'label' | 'hidden'>,
  ): void {
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
    this.items.set(mergeMenu(NAV, []));
    this.hideChrome.set(new Set());
    this.attempted.set(false);
  }

  async save(): Promise<void> {
    this.attempted.set(true);
    if (this.unnamed().length) {
      // Saving now would look like it worked and lose the grouping on the way back in.
      document.getElementById(`row-${this.unnamed()[0].key}`)?.focus();
      return;
    }
    this.saving.set(true);
    try {
      await this.stores.updateSettings(this.toSettings());
      this.toast.success(this.locale.t('settings.menu.saved'));
    } catch {
      this.toast.error(this.locale.t('error.generic'));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * The arrangement as it goes to the server: every entry, in order, in the group it is in,
   * whether hidden or not. Written in full rather than as a diff from the defaults — the
   * order is only meaningful as a whole list, and a partial one would have to be merged
   * against a default that may have changed underneath it. It is also what carries the
   * grouping: an entry is in a group because its key sits under that group's here.
   */
  private toSettings(): StoreSettings {
    // Structural: a group carries the same three arranged fields as an entry but no path.
    const row = (item: { key: string; hidden?: boolean; label?: string }): MenuSetting => ({
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
}
