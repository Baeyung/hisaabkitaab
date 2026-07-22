# HK-UI-01 — `Select` and `Combobox` are the same listbox, written twice

**Status:** Open · **Priority:** Medium · **Area:** Frontend / Shared · **Size:** ~626 lines today, ~200 recoverable · **Risk:** Medium (touches every filter toolbar and entry screen)

## Context

`shared/select/select.ts` (394 lines) and `shared/combobox/combobox.ts` (232 lines) are two
hand-rolled implementations of the ARIA 1.2 combobox pattern. Both exist for the same
stated reason — the native control's popup is undrawable with CSS — and both solve it the
same way. The duplication is not incidental; it is nearly line-for-line.

## What is duplicated

| Concern | `select.ts` | `combobox.ts` |
|---|---|---|
| Module-level `uid` counter for listbox/option ids | ✅ | ✅ |
| `optionId(i)` → `` `${listboxId}-opt-${i}` `` | ✅ | ✅ |
| `open` / `active` signals | ✅ | ✅ |
| `filtered()` — case-insensitive `includes` on the label | ✅ | ✅ (plus a `slice(0, 50)` cap) |
| ArrowDown / ArrowUp modular wrap, Enter picks, Escape closes | ✅ | ✅ |
| `scrollIntoView({ block: 'nearest' })` effect on `active()` | ✅ | ✅ |
| `mousedown` + `preventDefault()` so click beats blur | ✅ | ✅ |
| `role=combobox` + `aria-expanded` + `aria-activedescendant` + `role=listbox` | ✅ | ✅ |
| Popup CSS: `--kg-*` tokens, `border-radius: 10px`, `box-shadow: 0 12px 30px rgba(35,32,28,.16)`, `max-height: 240px` | ✅ | ✅ |
| Option CSS: `padding: 8px 10px`, `border-radius: 7px`, `--kg-surface` on active/hover | ✅ | ✅ |

## What actually differs

Only three things, and none of them justify a second component:

1. **Closed state.** `Select` renders a `<button>` trigger showing `selectedLabel()`;
   `Combobox` renders the `<input>` itself, always editable.
2. **Free text.** `Combobox` emits whatever is typed (entry screens match by name on save);
   `Select` emits only an option's `value`.
3. **Popup positioning.** `Select` uses `position: fixed` + `anchorPopup(...)` to escape
   ancestor `overflow: hidden`, re-anchoring on scroll/resize. `Combobox` uses
   `position: absolute; top: calc(100% + 4px)` and does **not**.

Point 3 is worth calling out on its own: it is a latent bug, not just a difference.
`Combobox` is used inside the entry-screen line grid, which is exactly the kind of
scrolling/clipping container `anchorPopup` was written for (see `S20` in the session log —
the dropdown that overflowed the viewport by 87.5px). If a combobox is ever opened near the
bottom of the viewport or inside a card with `overflow: hidden`, its list clips or runs off
screen. Merging the two components fixes this for free by giving the combobox the
positioning the select already has.

## Also duplicated: the field CSS

`combobox.ts` admits it in a comment:

```css
/* Mirrors .fld__input from sale.css — encapsulation walls off the parent's
   copy, so the field primitive is duplicated here (same deferred ticket). */
```

`.cbx__input` (combobox), `.sel__btn` (select), `.df__btn` (`date-field`) and `.fld__input`
(`sale.css`) are four copies of one 42–44px token-styled field: same `--kg-line-strong`
border, same `10px` radius, same `0 0 0 3px var(--kg-focus)` focus ring, same
`#b6afa4` placeholder. Any change to the field look has to be made in four places today.

## Proposed shape

One `shared/listbox/` component. Free text and the trigger button are inputs, not separate
classes:

```ts
readonly editable = input(false);   // true → the input is the trigger (combobox)
                                    // false → button trigger + search field (select)
```

Everything else — filtering, keyboard, ARIA, `anchorPopup`, option rendering — is written
once. `date-field` keeps its own grid (it is a calendar, not a list) but should share the
popup shell and the field CSS.

For the field primitive: promote the shared rules into `styles.css` as a real class the
components apply, or as a `:host`-safe custom-property block. Angular's style encapsulation
is what forced the copies; an unencapsulated global class is the boring fix.

## Sequencing

Land this in three commits so a visual regression bisects cleanly:

1. Extract the shared field CSS into `styles.css`; all four components consume it. No
   behaviour change.
2. Give `Combobox` the `anchorPopup` fixed positioning `Select` already has. This is the
   bug fix and is worth landing on its own even if the merge stalls.
3. Merge the two classes behind `editable`.

## Done when

- One component drives every dropdown in the app; `select/` and `combobox/` are gone.
- A combobox opened near the bottom of the viewport, and one inside a scrolled card, both
  place their list on screen.
- Keyboard behaviour is unchanged on both surfaces: type-to-filter, ↑/↓, Enter, Escape,
  and free text still saves on the entry screens.
- AXE passes on an entry screen and on the ledger filter toolbar.
