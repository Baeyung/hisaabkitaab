# Menu

The sidebar as shipped. The table lives in `src/frontend/src/app/layout/shell/nav.ts` (`NAV`);
this is its readable form. Every path is store-relative — the shell prefixes `/s/:storeId`.

An owner arranges this per shop under **Settings → Menu**: reorder, rename, hide. That is
presentation only — `arranged()` runs role filtering first, so no arrangement hands anyone a
screen their role does not reach. In easy mode the same arranged menu is drawn as the board
(one page of big buttons) instead of the sidebar.

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
