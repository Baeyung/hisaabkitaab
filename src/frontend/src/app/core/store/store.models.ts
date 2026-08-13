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
  /** A group's sub-entries in order. Absent on a plain link. */
  children?: MenuSetting[];
}

/**
 * How a shop's owner has arranged the app for everyone working in it. Mirrors the backend
 * `StoreSettings`, and arrives on every store — the shell needs it to draw the first frame.
 *
 * `menu` is not authoritative and is never read directly: `mergeMenu()` in
 * `layout/shell/nav.ts` reconciles it against the menu this build actually has, so an
 * arrangement saved before a screen existed still shows that screen.
 */
export interface StoreSettings {
  menu: MenuSetting[];
  hideChrome: ChromeItem[];
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
