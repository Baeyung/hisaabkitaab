# Menu

The sidebar as shipped. The table lives in `src/frontend/src/app/layout/shell/nav.ts` (`NAV`);
this is its readable form. Every path is store-relative — the shell prefixes `/s/:storeId`.

An owner arranges this per shop under **Settings → Menu**: regroup, reorder, rename, hide.
That is presentation only — `arranged()` runs role filtering first, so no arrangement hands
anyone a screen their role does not reach.

A shop has **two** arrangements and Settings → Menu edits the one it is currently navigating
by: the sidebar's while easy mode is off, the board's while it is on. They are stored as two
documents (`settings.menu` and `settings.easyMenu`) and neither touches the other, so a shop
can switch back and forth from General and find each as it left it. The screen carries the
document it is not editing straight through its own save.

The groups below are where things ship in the *sidebar*, not where they are stuck. Any entry
can be moved out of its group, onto the top level, or into a group the shop made for itself —
a "Counter" holding Sale and Bill Management, say. A shop's own group carries a `grp:` key instead of a
translation key and is named by the shop, since there is no built-in wording to fall back to;
one that was never named is dissolved on the way back in, its entries kept.

How deep nesting may go is the surface, not the code: `mergeMenu`'s `maxDepth` is 2 for the
sidebar (a group of entries) and 3 for the board (a tab of bands of buttons). A group standing
deeper than that is dissolved the same way an unnamed one is, its children kept one level up —
which is also what happens if a board document is ever read by the sidebar.

Two controls, two jobs. Dragging a row, and the up/down arrows beside it, reorder it inside the
list it is already in. The move button next to those is how a row changes list: it lists every
destination by name — the top level, each group, or a new group made on the spot — rather than
guessing one, so any entry reaches any group in a single move. Dragging between the two levels
is not offered: `CdkDropList` hides the enclosing `cdkDropListGroup` from lists nested inside
it, so the CDK never delivers such a drag, and hand-wiring it only works one way (see the class
comment on `SettingsMenu`).

## The board

Easy mode's home, and in easy mode the whole of the navigation. Same pipeline, same locks, one
level deeper:

| Menu | Board |
|---|---|
| a top-level group | a tab |
| a group inside it | a band of that tab, headed and coloured |
| an entry | a button, numbered 1–9 within its tab |
| an entry sitting straight on a tab | a band with no heading, in place |
| an entry left at the very top level | a button on the overflow tab |

A band carries a `tone` — `in`, `out` or `read` — and that is the one thing on the arranging
screen that is not about placement. It reports which way money moves and nothing else; `read`
takes the app's own accent rather than a third direction. A tone the running build does not
recognise reads as none at all, since the backend stores this document without knowing what
any of it means.

The board the app ships with is `BOARD` in `layout/shell/board.ts`, turned into a menu by
`EASY_NAV` — the same entries `NAV` has, in tabs and bands, with each group's `requires` and
`writes` pushed down onto the entries themselves so a button lifted out of New Entry still
greys on a closed shop. Anything `NAV` has that no band claims is appended to an overflow tab,
so a screen added without touching the board table still has a button.

## Locks

Two locks survive any arrangement: an item marked 🔒 cannot be hidden, and neither can a group
holding one — otherwise dragging Menu into a group of your own and switching that group off
would be the way to strand yourself. Emptying a group is not hiding it: drag every entry out
and the heading has nothing left to hold, so the sidebar drops it and every screen that was
behind it is one click nearer.

Legend: **E** editor or above, **O** owner only, no mark = everyone. † = records something, so it is greyed with a
reason while the shop is closed by its plan, rather than dropped. 🔒 = cannot be hidden.

| Item | Path | Role |
|---|---|---|
| Dashboard | `dashboard` | |
| Cashbook | `cashbook` | |
| Ledger | `ledger` | |
| Inventory | `inventory` | |
| Processed Goods | `processing` | |
| Bill Management | `bill-management` | |
| Purchases | `purchases` | |
| **New Entry** † | | **E** |
| ├ Sale | `new-entry/sale` | E |
| ├ Receipt | `new-entry/receipt` | E |
| ├ Purchase | `new-entry/purchase` | E |
| ├ Processing | `new-entry/processing` | E |
| ├ Expense | `new-entry/expense` | E |
| └ Payment | `new-entry/payment` | E |
| **Settings** 🔒 | | |
| ├ General | `settings/general` | E |
| ├ Users | `settings/users` | |
| ├ Items † | `settings/items` | E |
| ├ Parties † | `settings/party` | E |
| ├ Units † | `settings/units` | E |
| ├ Menu 🔒 | `settings/menu` | **O** |
| └ Reports | `settings/reports` | **O** |

## Not in the menu

Reached by link, not by navigation:

- `ledger/:partyId`, `ledger/category/:key` — one khata, one expense head
- `inventory/:itemId`, `processing/:transactionId` — one item, one batch recipe
- `bill-management/:billId`, `purchases/:purchaseId` — one bill either side
- `new-entry/<kind>/:entryId` — each entry screen doubles as its own editor (no `:entryId`
  twin for processing: a batch reprices the item it made, so correcting one is delete +
  re-enter)
- `board` — easy mode's home; reachable in any shop, only linked in easy mode

## Outside the shop

No `:storeId`, so outside the shell:

- `stores` (picker, the landing screen after login), `stores/new`, `s/:storeId/setup`,
  `stores/compare`
- `plan/limits` — where an account over its plan is sent
- `login`, `signup`, `forgot-password`, `verify-pending`

Public and unguarded:

- `info`, `privacy-policy`, `terms-and-conditions`
- `block/:token` — the opt-out link on every WhatsApp message; opened by a customer with no
  account here
- `report/daily/:storeId/:date/:token`, `report/reminder/:storeId/:partyId/:date/:token` —
  opened only by our own headless Chrome, which turns the page into the PDF the job sends.
  Nobody is signed in when a job runs; the signed `:token` is what authenticates the API calls.
