import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { BoardTone, ChromeItem, MenuSetting, StoreSettings } from '../../core/store/store.models';
import {
  NAV,
  NavGroup,
  NavIcon,
  NavItem,
  NavLink,
  customKey,
  isCustomGroup,
  mergeMenu,
} from '../../layout/shell/nav';
import { EASY_NAV } from '../../layout/shell/board';
import { NavIconMark } from '../../shared/nav-icon/nav-icon';
import { ToastService } from '../../shared/toast/toast.service';
import { CopyToStores, copyTargets } from './copy-to-stores';

/**
 * One row of the arranging list: a menu entry and how far in it sits, the top level being 1.
 *
 * The screen holds the menu flat rather than as the tree it saves, because every gesture on
 * it is "this row, one step" — a step down the list, or a step in or out of a group — and on
 * a tree each of those is a splice in one array and an insert in another, found by walking.
 * Flat, they are all the same edit: move a run of rows, then change its depth. The tree is
 * rebuilt once, on the way out (see {@link nest}).
 *
 * A group's `children` is always empty here. What is inside it is the run of rows below it
 * standing deeper, which is exactly what the eye reads off the screen.
 */
interface Row {
  item: NavItem;
  depth: number;
}

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
 * ## The list is the menu
 *
 * A row is drawn as the menu row it becomes — its mark, its name, and the indent and rail
 * that say what it is inside of. There is no separate preview beside it, because a preview
 * beside it would be a second drawing of the one thing on the screen, and the shopkeeper's
 * job would become comparing them. What you drag is what you get.
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
 * ## Moving
 *
 * One list, so one gesture. A row is dragged anywhere in the menu — past its group, into
 * another, out to the top — and where it lands decides what it is inside of: it takes the
 * deepest place the row above it offers. That is the whole rule, and it is the rule a
 * shopkeeper reads straight off the screen, since the row above is right there.
 *
 * It leaves exactly one thing unsayable, which is why the two step buttons exist: below a
 * group, "inside it" and "after it" are the same place in a list, so a row can never be
 * *dropped* at the top level once there is a group above it. `⟨` takes a row out of its
 * group and `⟩` puts it into the one before it, and they are offered only where they are
 * legal — most rows show one or neither.
 *
 * The nested drop lists this screen used to draw could not do any of it: `CdkDropList`
 * provides `CDK_DROP_LIST_GROUP: undefined` to its own subtree, so a nested list never joins
 * the enclosing `cdkDropListGroup` and a cross-list drag simply never arrives. Connecting
 * them by hand got a row *into* a group and not back out, because the outer list
 * geometrically contains every inner one and `_canReceive` claims the pointer first. Flat,
 * there is one list and nothing to connect.
 *
 * The whole menu is edited from {@link NAV}, not from what this owner currently sees, because
 * the arrangement is for the whole shop: a viewer's menu has no Entry group, and the owner
 * still has to be able to order it. That NAV and `navFor('OWNER')` are the same list is not
 * an accident to lean on — OWNER is the top rank, so nothing is filtered from it.
 */
@Component({
  selector: 'app-settings-menu',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, NavIconMark, CopyToStores],
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
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

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
  protected readonly rows = signal<Row[]>(
    flatten(mergeMenu(this.table, this.document(), this.maxDepth)),
  );
  protected readonly hideChrome = signal<ReadonlySet<ChromeItem>>(
    new Set(this.saved()?.hideChrome ?? []),
  );

  /**
   * What just moved and where it ended up, for the live region under the list. A move made
   * from the keyboard scrolls nothing and flashes nothing a screen reader reads, so the one
   * thing that changed is said in words.
   */
  protected readonly announced = signal('');

  /** The other shops this arrangement could be handed to, and whether they are being asked. */
  protected readonly otherStores = computed(() => copyTargets(this.stores, true));
  protected readonly copyOpen = signal(false);

  /** How many entries are currently arranged out, for the line under the heading. */
  protected readonly hiddenCount = computed(
    () => this.rows().filter((row) => row.item.hidden).length,
  );

  /**
   * Groups the shop made and has not named. A blank name is the one thing this screen will not
   * save: `mergeMenu` dissolves such a group on the way back in, so saving it would quietly
   * throw the grouping away rather than keep it.
   */
  protected readonly unnamed = computed(() =>
    this.rows().filter((row) => this.isBlankGroup(row.item)),
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
   *
   * Read off the rows below rather than off `children`, which is empty while the menu is
   * flat: what a group holds here is the run standing deeper than it.
   */
  protected locksMenu(index: number): boolean {
    const rows = this.rows();
    if (rows[index].item.locked === true) {
      return true;
    }
    return rows.slice(index, blockEnd(rows, index)).some((row) => row.item.locked === true);
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

  /**
   * The mark a row draws. A group the shop made has none of its own, so it borrows the one
   * belonging to the first thing inside it — the same borrowing the sidebar does, done here
   * against the rows below rather than against `children`, so the mark follows what is
   * dragged in and out while the arrangement is still being made.
   */
  protected icon(index: number): NavIcon {
    const rows = this.rows();
    const row = rows[index];
    if (!this.isCustom(row.item)) {
      return row.item.icon;
    }
    return rows[index + 1]?.depth === row.depth + 1 ? rows[index + 1].item.icon : 'menu';
  }

  /** A group with nothing under it yet, which is what you have the moment you make one. */
  protected isEmptyGroup(index: number): boolean {
    const rows = this.rows();
    return rows[index].item.kind === 'group' && blockEnd(rows, index) === index + 1;
  }

  /**
   * Whether this row shows the colour control: bands of the board do, and nothing else. A tab
   * is not coloured, and the sidebar has no colours at all — the tone reports which way money
   * moves through a band of buttons, and there are no bands anywhere else.
   */
  protected showsTone(row: Row): boolean {
    return this.easy && row.item.kind === 'group' && row.depth === 2;
  }

  /** A band's colour, or the app's own accent — which is what "neither direction" is here. */
  protected toneOf(row: Row): BoardTone {
    return (row.item.kind === 'group' ? row.item.tone : undefined) ?? 'read';
  }

  // ── moving ──────────────────────────────────────────────────────────

  /**
   * A drop. The CDK moved one row; what actually moves is that row and everything under it,
   * so the landing place is read as "which row is now above it" rather than as an index —
   * an index into a list missing one row is not an index into a list missing a whole group.
   */
  protected drop(event: CdkDragDrop<unknown>): void {
    const rows = this.rows();
    const seen = rows.filter((_, i) => i !== event.previousIndex);
    const above = event.currentIndex > 0 ? seen[event.currentIndex - 1] : null;
    const end = blockEnd(rows, event.previousIndex);
    // Dropping a group into its own children: the row above is one of the rows being moved,
    // so there is nowhere for it to land that is not inside itself.
    if (above && rows.indexOf(above) >= event.previousIndex && rows.indexOf(above) < end) {
      return;
    }
    this.place(event.previousIndex, above);
  }

  /**
   * One step down the list, or one step up it. The keyboard's reordering — `cdkDrag` has none
   * of its own — and it moves the row past whatever is next rather than past its siblings, so
   * the same two keys walk a row the whole length of the menu and through every group on the
   * way.
   */
  protected nudge(index: number, delta: -1 | 1): void {
    const rows = this.rows();
    if (delta === 1) {
      const end = blockEnd(rows, index);
      if (end >= rows.length) {
        return;
      }
      this.place(index, rows[end]);
    } else {
      if (index === 0) {
        return;
      }
      this.place(index, index >= 2 ? rows[index - 2] : null);
    }
  }

  /** Whether a row can leave the group it is in: it has to be in one. */
  protected canOutdent(index: number): boolean {
    return this.rows()[index].depth > 1;
  }

  /**
   * Whether a row can go into the group before it. There has to *be* one — the nearest row
   * above standing at this row's own depth has to be a group — and what the row is carrying
   * has to fit under it.
   */
  protected canIndent(index: number): boolean {
    const rows = this.rows();
    const depth = rows[index].depth;
    for (let i = index - 1; i >= 0; i--) {
      if (rows[i].depth < depth) {
        return false;
      }
      if (rows[i].depth === depth) {
        return rows[i].item.kind === 'group' && depth + heightAt(rows, index) <= this.maxDepth;
      }
    }
    return false;
  }

  /**
   * Out of the group, and out to just past it: a row that steps out of a heading belongs
   * after what that heading holds, not wedged into the middle of it where it would cut the
   * group in two.
   */
  protected outdent(index: number): void {
    const rows = this.rows();
    const depth = rows[index].depth;
    if (depth <= 1) {
      return;
    }
    let after = blockEnd(rows, index);
    while (after < rows.length && rows[after].depth >= depth) {
      after++;
    }
    this.place(index, rows[after - 1] ?? null, depth - 1);
  }

  /** Into the group before it, where it already stands — only its depth changes. */
  protected indent(index: number): void {
    if (!this.canIndent(index)) {
      return;
    }
    const rows = this.rows();
    this.place(index, index > 0 ? rows[index - 1] : null, rows[index].depth + 1);
  }

  /**
   * Take one row — and everything standing under it — out of where it is and put it after
   * `above`. The single edit every move on this screen is written in, so the rules about what
   * may sit where are stated once.
   *
   * The depth it lands at is the deepest the place allows: after a group heading that means
   * inside it, and after a plain entry it means beside that entry. `wanted` is how the two
   * step buttons ask for something shallower, which is the one thing a landing place cannot
   * say for itself — below a heading, "inside it" and "after it" are the same place in a list.
   */
  private place(index: number, above: Row | null, wanted?: number): void {
    this.rows.update((rows) => {
      const end = blockEnd(rows, index);
      const block = rows.slice(index, end);
      const rest = [...rows.slice(0, index), ...rows.slice(end)];
      let at = above ? rest.indexOf(above) + 1 : 0;
      if (at < 0) {
        return rows;
      }

      const prev = rest[at - 1];
      const room = prev ? (prev.item.kind === 'group' ? prev.depth + 1 : prev.depth) : 1;
      // A group is not one row being placed, it is everything under it being placed too, so
      // what has to fit is the whole block's height and not the one row.
      const depth = Math.max(
        1,
        Math.min(room, this.maxDepth - heightAt(rows, index) + 1, wanted ?? this.maxDepth),
      );
      // Landing shallower than where the pointer stopped means closing the groups it stopped
      // inside, so it lands past what they hold rather than splitting them.
      while (at < rest.length && rest[at].depth > depth) {
        at++;
      }

      const shift = depth - block[0].depth;
      rest.splice(at, 0, ...block.map((row) => ({ ...row, depth: row.depth + shift })));
      const next = normalize(rest, this.maxDepth);
      this.announce(next, at);
      return next;
    });
  }

  /** Where a row ended up, in words, for the live region — and for anyone not watching it. */
  private announce(rows: readonly Row[], index: number): void {
    const row = rows[index];
    let parent = this.locale.t('settings.menu.atTop');
    for (let i = index - 1; i >= 0; i--) {
      if (rows[i].depth < row.depth) {
        parent = this.name(rows[i].item);
        break;
      }
    }
    const siblings = rows.filter(
      (other, i) => other.depth === row.depth && parentOf(rows, i) === parentOf(rows, index),
    );
    this.announced.set(
      this.locale.t('settings.menu.at', {
        item: this.name(row.item),
        n: (siblings.indexOf(row) + 1).toString(),
        m: siblings.length.toString(),
        where: parent,
      }),
    );
  }

  /**
   * The arrow keys on a row's grip. `cdkDrag` has no keyboard mode, so without these the
   * screen would have a gesture and no other way through it. Up and down walk the list; the
   * other two are the step buttons under the fingers already on the row, mirrored under Urdu
   * because they mean "out" and "in", not "left" and "right".
   */
  protected key(index: number, event: KeyboardEvent): void {
    const rtl = this.locale.dir() === 'rtl';
    const actions: Record<string, () => void> = {
      ArrowUp: () => this.nudge(index, -1),
      ArrowDown: () => this.nudge(index, 1),
      ArrowLeft: () => (rtl ? this.indent(index) : this.outdent(index)),
      ArrowRight: () => (rtl ? this.outdent(index) : this.indent(index)),
    };
    const action = actions[event.key];
    if (!action) {
      return;
    }
    event.preventDefault();
    const key = this.rows()[index].item.key;
    action();
    // The row moved out from under the focus ring; the grip on it has to keep it, or a
    // second press would move whatever slid into its place.
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(`[data-grip="${cssEscape(key)}"]`)
          ?.focus({ preventScroll: false }),
      { injector: this.injector },
    );
  }

  // ── groups the shop makes ───────────────────────────────────────────

  /**
   * A new, empty, unnamed group at the foot of the list, with the cursor in its name box —
   * naming it is the first thing to do, and the only thing that stops the save.
   */
  protected addGroup(): void {
    const key = customKey();
    this.rows.update((rows) => [
      ...rows,
      {
        item: { kind: 'group', key, icon: 'menu', label: '', hidden: false, children: [] },
        depth: 1,
      },
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
   *
   * What was inside it is stepped up a level here rather than left for `normalize` to settle.
   * `normalize` only ever brings a row *up to* what the row above allows, and the row above
   * a removed heading is usually the last entry of the group before it — so left alone, the
   * entries would not come out into the open, they would quietly join the previous group.
   */
  protected removeGroup(index: number): void {
    this.rows.update((rows) => {
      const end = blockEnd(rows, index);
      const freed = rows.slice(index + 1, end).map((row) => ({ ...row, depth: row.depth - 1 }));
      return normalize([...rows.slice(0, index), ...freed, ...rows.slice(end)], this.maxDepth);
    });
  }

  // ── naming and hiding ───────────────────────────────────────────────

  /**
   * Kept exactly as typed, and only trimmed on the way out (see {@link toSettings}). The box
   * is bound one-way to this value, so normalising here would rewrite what someone is in the
   * middle of typing — a leading space would vanish from under the caret.
   */
  protected rename(index: number, event: Event): void {
    this.patch(index, { label: (event.target as HTMLInputElement).value });
  }

  protected toggleShown(index: number): void {
    this.patch(index, { hidden: !this.rows()[index].item.hidden });
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
   * Replace one row's arranged fields. A patch object rather than a mapping function so the
   * spread keeps the row's own type — a row is a link or a group, and only a group carries a
   * colour.
   */
  private patch(index: number, change: Pick<Partial<NavGroup>, 'label' | 'hidden' | 'tone'>): void {
    this.rows.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, item: { ...row.item, ...change } } : row)),
    );
  }

  protected setTone(index: number, event: Event): void {
    this.patch(index, { tone: (event.target as HTMLSelectElement).value as BoardTone });
  }

  /** Back to the menu the app ships with. Local until saved, like every other edit here. */
  protected reset(): void {
    this.rows.set(flatten(mergeMenu(this.table, [], this.maxDepth)));
    this.hideChrome.set(new Set());
    this.attempted.set(false);
    this.announced.set('');
  }

  /** Answers whether the arrangement went in, which is what {@link copyArrangement} waits on. */
  async save(): Promise<boolean> {
    this.attempted.set(true);
    if (this.unnamed().length) {
      // Saving now would look like it worked and lose the grouping on the way back in.
      document.getElementById(`row-${this.unnamed()[0].item.key}`)?.focus();
      return false;
    }
    this.saving.set(true);
    try {
      await this.stores.updateSettings(this.toSettings());
      this.toast.success(this.locale.t('settings.menu.saved'));
      return true;
    } catch {
      this.toast.error(this.locale.t('error.generic'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Hand the same arrangement to the shop's other branches: saved here first, then written
   * into each of them, so what travels is what this shop is now running rather than a
   * half-finished screen. A save that will not go through — an unnamed group — stops the copy
   * too, on the same reasoning and with the same message.
   *
   * Only the document this screen edits travels, into the same slot on the other side: a
   * board arranged here lands as the other shop's board and leaves its sidebar alone, and
   * neither one switches the other shop between them — `easyMode` is General's, and a branch
   * that works from the sidebar goes on doing so with a board waiting for the day it doesn't.
   * The foot controls go along because they are arranged on this screen and nowhere else;
   * reports and the sale grid are other screens' and stay as the target had them.
   *
   * An arrow rather than a method — it is passed to the panel as a value, so it has to carry
   * its own `this`.
   */
  protected readonly copyArrangement = async (ids: string[]): Promise<string[]> => {
    if (!(await this.save())) {
      return ids;
    }
    const arranged = this.toSettings();
    return this.stores.copySettingsTo(ids, (target) => ({
      ...target,
      ...(this.easy ? { easyMenu: arranged.easyMenu } : { menu: arranged.menu }),
      hideChrome: arranged.hideChrome,
    }));
  };

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

    const arrangement = nest(this.rows()).map(row);
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
      // And again: Custom Fields owns this. Reordering a sidebar must not be what resets a
      // shop's sale and purchase grids back to the built-in columns.
      customFields: saved?.customFields,
    };
  }
}

// ── flat and back ─────────────────────────────────────────────────────
//
// The tree is what the server stores and what the sidebar draws; flat is what this screen
// edits. The two conversions below are the only places either shape is assumed, and the
// invariant they meet in the middle is `normalize`'s: the first row stands at 1, and no row
// stands deeper than the row above it allows.

/** The tree as rows, in the order the screen draws them. */
function flatten(items: readonly NavItem[], depth = 1): Row[] {
  return items.flatMap<Row>((item) =>
    item.kind === 'group'
      ? [{ item: { ...item, children: [] }, depth }, ...flatten(item.children, depth + 1)]
      : [{ item, depth }],
  );
}

/** The rows as a tree again: a group takes the run below it that stands deeper. */
function nest(rows: readonly Row[]): NavItem[] {
  const build = (depth: number, from: number): { items: NavItem[]; next: number } => {
    const items: NavItem[] = [];
    let i = from;
    while (i < rows.length && rows[i].depth >= depth) {
      const { item } = rows[i];
      if (item.kind !== 'group') {
        items.push(item);
        i++;
        continue;
      }
      const inside = build(depth + 1, i + 1);
      items.push({ ...item, children: inside.items });
      i = inside.next;
    }
    return { items, next: i };
  };
  return build(1, 0).items;
}

/**
 * The rows with every depth made legal: nothing deeper than the row above it offers, nothing
 * past the depth the surface draws, nothing shallower than the top level. Run after every
 * edit, so no other function has to prove it left the list arrangeable — pulling a heading
 * out from over a run is the case that needs it, since what it held has to come up a level.
 */
function normalize(rows: readonly Row[], maxDepth: number): Row[] {
  let room = 1;
  return rows.map((row) => {
    const depth = Math.min(Math.max(row.depth, 1), room);
    room = row.item.kind === 'group' ? Math.min(depth + 1, maxDepth) : depth;
    return depth === row.depth ? row : { ...row, depth };
  });
}

/** One past the last row standing under this one — the end of what it carries when it moves. */
function blockEnd(rows: readonly Row[], index: number): number {
  let end = index + 1;
  while (end < rows.length && rows[end].depth > rows[index].depth) {
    end++;
  }
  return end;
}

/**
 * How many levels a row takes up where it lands: 1 for an entry, and for a group one more
 * than the deepest thing under it. An empty group still counts as 2 — it is empty because it
 * was made a moment ago, and a heading that can never hold anything is worse than one that
 * was never offered. Mirrors `height` in nav.ts, read off the rows instead of the tree.
 */
function heightAt(rows: readonly Row[], index: number): number {
  const end = blockEnd(rows, index);
  const deepest = Math.max(...rows.slice(index, end).map((row) => row.depth));
  const own = deepest - rows[index].depth + 1;
  return rows[index].item.kind === 'group' ? Math.max(own, 2) : own;
}

/** Which group a row is in, as the index of its heading, or -1 for the top level. */
function parentOf(rows: readonly Row[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth < rows[index].depth) {
      return i;
    }
  }
  return -1;
}

/** `grp:` keys carry a colon, which a bare attribute selector would read as a pseudo-class. */
function cssEscape(key: string): string {
  return key.replace(/["\\]/g, '\\$&');
}
