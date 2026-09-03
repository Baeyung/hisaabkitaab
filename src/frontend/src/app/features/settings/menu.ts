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
import { BoardTone, ChromeItem, MenuSetting, StoreSettings } from '../../core/store/store.models';
import {
  NAV,
  NavGroup,
  NavItem,
  NavLink,
  customKey,
  height,
  holdsLocked,
  isCustomGroup,
  mergeMenu,
} from '../../layout/shell/nav';
import { EASY_NAV } from '../../layout/shell/board';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * What a band of the board may be coloured for. Three, and deliberately only three: the
 * colour reports which way money moves, and a fourth would be decoration competing with the
 * one thing it is there to say.
 */
const TONES: ReadonlyArray<{ tone: BoardTone; label: TranslationKey }> = [
  { tone: 'in', label: 'settings.menu.tone.in' },
  { tone: 'out', label: 'settings.menu.tone.out' },
  { tone: 'read', label: 'settings.menu.tone.read' },
];

/** The foot controls a shop may switch off, in the order the sidebar stacks them. */
const CHROME: ReadonlyArray<{ item: ChromeItem; label: TranslationKey }> = [
  { item: 'THEME', label: 'settings.menu.chrome.theme' },
  { item: 'INSTALL', label: 'settings.menu.chrome.install' },
  { item: 'PLAN', label: 'settings.menu.chrome.plan' },
];

/**
 * Store Settings › Menu — the shop's own arrangement of the app: what order it goes in, what
 * is grouped with what, what each entry is called, what is left out of it, and which of the
 * foot's controls are on.
 *
 * ## Which menu
 *
 * A shop has two arrangements and this screen edits the one it is currently navigating by:
 * the sidebar's while easy mode is off, the board's while it is on. Two documents, kept apart
 * on purpose — the two are different shapes for different rooms, a list read at a desk and a
 * surface aimed at across a counter, and a shop that switches between them finds each as it
 * left it. Switching is done from General, not here, and this screen carries the other
 * document through its save untouched.
 *
 * The board is one level deeper than the sidebar, which is the only thing that differs: a
 * top-level group is a tab, a group inside it is a band of that tab, and a band carries the
 * colour that says which way money moves through it. Everything below treats that as a
 * number — `maxDepth` — rather than as a second screen.
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
  protected readonly tones = TONES;

  protected readonly saving = signal(false);
  /** Set by the first save attempt, so the unnamed-group warning appears then and not while typing. */
  protected readonly attempted = signal(false);

  /**
   * Which of the shop's two arrangements this screen is editing, and everything that follows
   * from it: the table to merge against, and how deep the surface it draws actually goes.
   *
   * Read once, not as a signal. Easy mode is changed from General, which navigates away and
   * rebuilds this screen; having the page swap the document out from under a half-finished
   * arrangement would be the only way to lose one.
   */
  protected readonly easy = this.saved()?.easyMode === true;
  private readonly table = this.easy ? EASY_NAV : NAV;
  protected readonly maxDepth = this.easy ? 3 : 2;

  /**
   * The whole menu, hidden entries included — this is the one screen that has to show what it
   * is hiding, or there would be no way to bring anything back.
   */
  protected readonly items = signal<NavItem[]>(
    mergeMenu(this.table, this.document(), this.maxDepth),
  );
  protected readonly hideChrome = signal<ReadonlySet<ChromeItem>>(
    new Set(this.saved()?.hideChrome ?? []),
  );

  /** Every row on the screen, at whatever depth it sits. */
  private readonly rows = computed(() => walk(this.items()));

  /** How many entries are currently arranged out, for the line under the heading. */
  protected readonly hiddenCount = computed(() => this.rows().filter((item) => item.hidden).length);

  /**
   * Groups the shop made and has not named. A blank name is the one thing this screen will not
   * save: `mergeMenu` dissolves such a group on the way back in, so saving it would quietly
   * throw the grouping away rather than keep it.
   */
  protected readonly unnamed = computed(() =>
    this.rows().filter((item) => this.isBlankGroup(item)),
  );

  private saved(): StoreSettings | undefined {
    return this.stores.current()?.settings;
  }

  /** The arrangement being edited: the board's in easy mode, the sidebar's otherwise. */
  private document(): MenuSetting[] | undefined {
    return this.easy ? this.saved()?.easyMenu : this.saved()?.menu;
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
    return holdsLocked(item);
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

  /** Every group on the screen with the depth it sits at, in the order the menu draws them. */
  private readonly allGroups = computed(() => groupsOf(this.items(), 1));

  protected group(key: string): NavGroup | undefined {
    return this.allGroups().find((found) => found.group.key === key)?.group;
  }

  /**
   * Whether this row shows the colour control: bands of the board do, and nothing else. A tab
   * is not coloured, and the sidebar has no colours at all — the tone reports which way money
   * moves through a band of buttons, and there are no bands anywhere else.
   */
  protected showsTone(item: NavItem, depth: number): boolean {
    return this.easy && item.kind === 'group' && depth === 2;
  }

  // ── moving ──────────────────────────────────────────────────────────

  /**
   * What a drop list carries: the group it holds, or null for the top level. Every list on
   * the screen is typed the same — a drop can go from any of them to any other, and the
   * handler below is where they all meet.
   */
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

  /**
   * Where this row may go, by name. A destination has to have room under it for the row *and
   * everything the row brings with it* — which is what {@link height} measures, and why it is
   * not simply "one level for an entry, two for a group". A board tab is three levels tall on
   * its own: the tab, its bands, and their buttons. Offering it another tab to move into would
   * be offering to bury its bands one level past what the board draws, and they would be
   * dissolved on the way back in — the tab gone from the strip and its six screens tipped out
   * into one uncoloured heap.
   *
   * The same measure keeps the sidebar one level deep, so neither is spelled out twice.
   */
  protected destinationsFor(item: NavItem): NavGroup[] {
    const room = height(item);
    return this.allGroups()
      .filter((found) => found.group.key !== item.key && found.depth + room <= this.maxDepth)
      .map((found) => found.group);
  }

  /**
   * Whether "a new group" is among this row's destinations. The new group lands at the top
   * level with the row inside it, so the row needs one level more than it would standing
   * there itself — which a board tab does not have.
   */
  protected canNestInNew(item: NavItem): boolean {
    return 1 + height(item) <= this.maxDepth;
  }

  protected readonly destinations = computed(() => {
    const m = this.moving();
    return m ? this.destinationsFor(m.item) : [];
  });

  /**
   * Whether a row is offered the move button at all. A row inside a group always is — the top
   * level is somewhere it can go. A row already at the top level is only offered it if some
   * group will take it, which is how a sidebar group ends up with no button: one level of
   * nesting leaves it nowhere else to be.
   */
  protected canMove(item: NavItem, from: NavGroup | null): boolean {
    return from !== null || this.destinationsFor(item).length > 0 || this.canNestInNew(item);
  }

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
        ? this.topIndexOf(from.from?.key) + 1
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
    if (!this.canNestInNew(from.item)) {
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

  /**
   * Where the row's old group sits at the top level — the group itself, or the tab holding it.
   * Coming out to the top level lands just below that, which is somewhere the eye already is;
   * the foot of the whole menu is probably off the screen.
   */
  private topIndexOf(key: string | undefined): number {
    return key ? this.items().findIndex((item) => depthOf([item], key) > 0) : -1;
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
      const next = clone(items);
      const from = listIn(next, fromKey);
      const to = listIn(next, toKey);
      const row = from?.[fromIndex];
      if (!from || !to || !row) {
        return items;
      }
      // The two things no move may produce, stated once here rather than trusted to the
      // controls that offer the move: a row — or anything it is carrying — standing deeper
      // than the surface draws, and a group dropped inside itself. A drag can ask for either;
      // a button asks for neither.
      if (depthOf(next, toKey) + height(row) > this.maxDepth) {
        return items;
      }
      if (row.kind === 'group' && toKey !== null && listIn([row], toKey)) {
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
    const strip = (items: readonly NavItem[]): NavItem[] =>
      items.flatMap<NavItem>((item) =>
        item.key === group.key
          ? group.children
          : item.kind === 'group'
            ? [{ ...item, children: strip(item.children) }]
            : [item],
      );
    this.items.update(strip);
  }

  // ── naming and hiding ───────────────────────────────────────────────

  /**
   * Kept exactly as typed, and only trimmed on the way out (see {@link toSettings}). The box
   * is bound one-way to this value, so normalising here would rewrite what someone is in the
   * middle of typing — a leading space would vanish from under the caret.
   */
  protected rename(key: string, event: Event): void {
    this.patch(key, { label: (event.target as HTMLInputElement).value });
  }

  protected setShown(key: string, event: Event): void {
    this.patch(key, { hidden: !(event.target as HTMLInputElement).checked });
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
  private patch(key: string, change: Pick<Partial<NavLink>, 'label' | 'hidden'>): void {
    const apply = (items: readonly NavItem[]): NavItem[] =>
      items.map((item) =>
        item.key === key
          ? { ...item, ...change }
          : item.kind === 'group'
            ? { ...item, children: apply(item.children) }
            : item,
      );
    this.items.update(apply);
  }

  /**
   * A band's colour. Its own walk rather than a third field on {@link patch} because only a
   * group carries one — spreading it onto an entry would put a field on a row that has no
   * use for it, and it would be saved.
   */
  protected setTone(key: string, event: Event): void {
    const tone = (event.target as HTMLSelectElement).value as BoardTone;
    const apply = (items: readonly NavItem[]): NavItem[] =>
      items.map((item) =>
        item.kind !== 'group'
          ? item
          : item.key === key
            ? { ...item, tone }
            : { ...item, children: apply(item.children) },
      );
    this.items.update(apply);
  }

  /** Back to the menu the app ships with. Local until saved, like every other edit here. */
  protected reset(): void {
    this.items.set(mergeMenu(this.table, [], this.maxDepth));
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
    // Structural, and the same at every depth: a group carries the arranged fields an entry
    // does, plus a colour and whatever is under it, and no path.
    const row = (item: NavItem): MenuSetting => ({
      key: item.key,
      hidden: item.hidden === true,
      // Blank is not a name — it means "use the built-in one". Trimmed here rather than as
      // it is typed, so the box never edits itself while someone is in it.
      label: item.label?.trim() || undefined,
      tone: item.kind === 'group' ? item.tone : undefined,
      children: item.kind === 'group' ? item.children.map(row) : undefined,
    });

    const arrangement = this.items().map(row);
    const saved = this.saved();
    return {
      // One of the two is what this screen just edited; the other is carried through exactly
      // as it was stored. The endpoint replaces the whole document, so a shop that arranges
      // its board would otherwise come back to the sidebar it never touched reset.
      menu: this.easy ? (saved?.menu ?? []) : arrangement,
      easyMenu: this.easy ? arrangement : saved?.easyMenu,
      hideChrome: [...this.hideChrome()],
      // Carried through for the same reason, and this one matters twice over: it is what
      // decides which of the two documents above this screen edits next time. General owns it.
      easyMode: saved?.easyMode === true,
      // The same again: Reports owns this, and arranging a menu must not be what silently
      // switches a shop's nightly report and khata reminders back off.
      reports: saved?.reports,
    };
  }
}

// ── walking the tree ──────────────────────────────────────────────────
//
// Three small recursions, each used by name where the reason for walking is stated. The two
// lookups a move needs — which array a group holds, and how deep it sits — are not a fourth
// and a fifth: they are `groupsOf` read two ways, since it has already found every group and
// noted its depth on the way past.

/** Every row, at every depth, in the order the screen draws them. */
function walk(items: readonly NavItem[]): NavItem[] {
  return items.flatMap<NavItem>((item) =>
    item.kind === 'group' ? [item, ...walk(item.children)] : [item],
  );
}

/** Every group with the depth it sits at, the top level counting as 1. */
function groupsOf(
  items: readonly NavItem[],
  depth: number,
): Array<{ group: NavGroup; depth: number }> {
  return items.flatMap((item) =>
    item.kind === 'group' ? [{ group: item, depth }, ...groupsOf(item.children, depth + 1)] : [],
  );
}

/** A copy nothing else is holding, so a splice below cannot reach the menu on screen. */
function clone(items: readonly NavItem[]): NavItem[] {
  return items.map((item) =>
    item.kind === 'group' ? { ...item, children: clone(item.children) } : item,
  );
}

function found(items: readonly NavItem[], key: string) {
  return groupsOf(items, 1).find((entry) => entry.group.key === key);
}

/**
 * The array a key's group holds, or the whole menu for the top level. The array itself and
 * not a copy of it — a move splices this — which is why the caller passes the tree it is
 * about to edit rather than the one on screen.
 */
function listIn(items: NavItem[], key: string | null): NavItem[] | undefined {
  return key === null ? items : found(items, key)?.group.children;
}

/** How deep a group sits, the top level being 0 — and 0 again for a key that is not there. */
function depthOf(items: readonly NavItem[], key: string | null): number {
  return key === null ? 0 : (found(items, key)?.depth ?? 0);
}
