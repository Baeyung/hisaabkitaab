/**
 * What a user may do in one shop. `OWNER` is the shop's creator; the other two are
 * granted from Store Settings › Manage Users. Mirrors the backend `StoreRole` — the
 * backend refuses anything above the caller's role regardless of what the UI shows,
 * so these are for hiding controls, never for enforcing anything.
 */
export type StoreRole = 'VIEWER' | 'EDITOR' | 'OWNER';

/**
 * A control in the sidebar foot a shop's owner may switch off. Mirrors the backend
 * `ChromeItem`, and note what is *not* in it: the language switcher is never hideable —
 * it is the way out of a language you cannot read.
 */
export type ChromeItem = 'THEME' | 'INSTALL' | 'PLAN';

/**
 * What a band of the easy-mode board is coloured for. Exactly one thing: which way money
 * moves — `in` and `out` are the only tones that say so, and `read` is everything else,
 * which takes the app's own accent rather than a direction.
 *
 * Lives here rather than beside the board it draws because a shop picks it and it is saved:
 * it is part of the stored document's vocabulary, the way `ChromeItem` above is.
 */
export type BoardTone = 'in' | 'out' | 'read';

/**
 * One entry in a shop's arranged menu, keyed by the same `TranslationKey` the built-in menu
 * uses (`nav.ledger`) — every item in `NAV` already carries a stable id, so arranging one
 * needs no new ones. Mirrors the backend `MenuSetting`.
 */
export interface MenuSetting {
  key: string;
  /** Left out of the sidebar. Presentation only — the route behind it stays reachable. */
  hidden?: boolean;
  /** What this shop calls it, or absent to keep the built-in name. One string for both languages. */
  label?: string;
  /**
   * Which way money moves through a band of the board. Only the board's middle level carries
   * one; absent everywhere else, including everywhere in the sidebar's document.
   */
  tone?: BoardTone;
  /** A group's sub-entries in order. Absent on a plain link. */
  children?: MenuSetting[];
}

/**
 * When this shop's scheduled reports go out, and who the reminders chase. Mirrors the backend
 * `ReportSettings`, and unlike the rest of this document the backend genuinely reads it —
 * `ReportScheduler` acts on these fields every minute, so they are validated on the way in.
 *
 * Both jobs are off until an owner turns them on, which is the only safe default for something
 * that puts messages on customers' phones: a shop still keying in its opening khatas must not
 * start chasing people over balances that are not yet true.
 */
export interface ReportSettings {
  /** The nightly report to the shop's owner. */
  dailyEnabled: boolean;
  /** `HH:mm` in the shop's own timezone — exactly what `<input type="time">` produces. */
  dailyTime: string;
  /** The monthly khata reminders to the parties who owe. */
  reminderEnabled: boolean;
  /** Day of the month to chase on; 31 clamps to the real last day, so it means "month end". */
  reminderDay: number;
  reminderTime: string;
  /** Only chase a party owing at least this much. */
  reminderMinAmount: number;
  /**
   * Only chase once their oldest unpaid bill has sat this long. Measured by FIFO settlement,
   * not by the last payment received — so a party paying a token amount monthly against an old
   * bill is still stale, which is the point.
   */
  reminderMinDaysStale: number;
}

/**
 * How a shop's owner has arranged the app for everyone working in it. Mirrors the backend
 * `StoreSettings`, and arrives on every store — the shell needs it to draw the first frame.
 *
 * Neither arrangement is authoritative and neither is read directly: `mergeMenu()` in
 * `layout/shell/nav.ts` reconciles each against the menu this build actually has, so an
 * arrangement saved before a screen existed still shows that screen.
 */
export interface StoreSettings {
  menu: MenuSetting[];
  /**
   * The same thing again for the easy-mode board, arranged separately and kept separately, so
   * a shop that switches between the two finds each as it left it. Optional on the way in
   * only because an arrangement saved before the board could be arranged has no field for it;
   * absent reads as the board the app ships with.
   */
  easyMenu?: MenuSetting[];
  hideChrome: ChromeItem[];
  /**
   * Optional on the way in only because an arrangement saved before reports existed has no
   * field for it — absent reads as both jobs off. Anything rebuilding this document field by
   * field has to carry it through, or saving an unrelated screen would switch a shop's reports
   * off; see `menu.ts`.
   */
  reports?: ReportSettings;
  /**
   * Navigate from the board — one screen of big buttons — instead of the sidebar. A shop
   * setting rather than a personal one, because the counter tablet is shared: whoever is
   * standing at it gets the same app. Presentation only, like `hidden` above; the board is
   * built from the same arranged `menu`, so it inherits the order, names and hiding.
   *
   * Optional on the way in only because an arrangement saved before the board existed has no
   * field for it. Absent reads as off, which is the sidebar those shops already had.
   */
  easyMode?: boolean;
}

/**
 * A shop the signed-in user can reach — their own, or one shared with them. Mirrors the
 * backend `StoreSummary`. `logoUri` / `watermarkUri` currently hold a base64 data URI
 * (see docs/tickets/HK-store-media-object-storage.md).
 */
export interface Store {
  id: string;
  name: string;
  address: string;
  contact: string;
  logoUri: string;
  watermarkUri: string;
  /** This user's role in this shop, not the shop's own property. */
  role: StoreRole;
  /** Whose shop it is — shown on shared shops ("Shared by …"). */
  ownerName: string;
  /**
   * Whether the owner's plan has this shop closed: readable and printable, but no new
   * entries. Not a role — a closed shop is closed to its owner too. See {@link
   * StoreService.canEdit}, which folds it in so every editor route already refuses.
   */
  suspended: boolean;
  /**
   * How the shop is arranged, set by its owner and read by everyone in it. Always present —
   * a shop nobody has arranged sends the empty arrangement, not null.
   */
  settings: StoreSettings;
}

/**
 * The editable shape sent on create/update: the shop's own fields, nothing about who is
 * asking. `settings` is out because it has its own endpoint — the backend ignores it on this
 * body (`@JsonIgnore`), so sending it here would look like it worked and quietly do nothing.
 */
export type StoreDraft = Omit<Store, 'id' | 'role' | 'ownerName' | 'suspended' | 'settings'>;
