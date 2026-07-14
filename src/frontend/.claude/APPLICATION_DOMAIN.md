# Design Brief — Business Management App for the Local Cloth Market (Pakistan)

## 1. Product in one paragraph

A business-management app for small-to-mid cloth wholesalers and retailers in Pakistani markets (think Faisalabad's kapra market). It **replaces paper registers, not the counter workflow.** Shopkeepers keep cutting bills and serving customers exactly as they do today; the app is where they record what happened — accurately, with a trustworthy trail. It is explicitly **NOT a scan-based POS.** There are no barcodes. Every entry is manual. The product's job is to turn the shopkeeper's paper cashbook, khata (party ledgers), stock register, and bills into one clean digital system whose numbers they can trust — and, crucially, that agrees with the physical cash in the drawer every single night.

## 2. Who uses it, and their reality

- **The shop owner / operator.** Runs a cloth business on credit (udhaar). Moderate-to-low digital literacy; deeply fluent in their own paper system. Older users common — legibility and large targets matter.
- **Two usage modes, one interface.** At first they do **day-end batch entry** — a stack of paper bills keyed in at night, in a fast rhythm. Later, as trust builds, they enter transactions **live** as events happen, possibly going paperless. The UI must serve both without being two different things. Batch = speed and keyboard rhythm; live = quick, interruptible, accurate.
- **Trust is the product.** These users are moving their livelihood off paper they can physically see. The design must earn trust: numbers that reconcile, edits that are visible and reversible, nothing that feels like it could silently lose an entry.

## 3. Design north stars (rank order)

1. **Entry speed beats everything.** The transaction-entry screen is where this product is won or lost. Keyboard-first, minimal clicks, smart defaults that carry over, fast "save & next," item lookup by typing a design number. If entry is slow, they go back to paper.
2. **Mirror the mental model, hide the accounting.** Speak their language — *"Rana owes you 50,000," "you owe Crescent 20,000," baqaya, khata, udhaar* — never "debit/credit/accounts receivable." The double-entry engine is invisible; the shopkeeper sees people, money, and stock.
3. **Reconciliation as a designed moment.** The nightly "closing cash should equal the galla" check is a hero feature, not a footnote. Make the match feel good and a mismatch feel calm and fixable.
4. **Profit is not cash — show both, separately.** A core insight the app must teach visually: the shop can make a profit today yet see its cash drop (because it paid down a supplier). Dashboard must present *cash position* and *profit* as two distinct, clearly-labelled things.
5. **Forgiving and legible.** Large numerals, high contrast, generous spacing. Easy to correct a mistyped entry. Early on, paper is the master and the app is the copy — so editing must be frictionless, with a visible history.
6. **Calm, not flashy.** This is a tool used daily for money. Restraint over decoration. No gradients-for-drama, no dashboard-template clutter.

## 4. Visual direction

- **Tone:** trustworthy, calm, legible, locally credible. Think "well-kept ledger," not "fintech startup."
- **Density:** information-dense where it counts (ledgers, cashbook, entry grids read like clean tables) but with breathing room. Avoid cramped *and* avoid wasteful whitespace.
- **Color:** a restrained neutral base with one confident accent. Use color semantically and sparingly — e.g. money-in vs money-out, "they owe you" (asset) vs "you owe them" (liability), reconciliation match vs mismatch. Never rely on color alone (pair with sign/icon/label) — some users are older, some screens are cheap.
- **Typography:** a numeral-strong, highly legible family for figures (tabular/lining numerals so columns align). A first-class Urdu face for labels. Test everything at real Urdu string lengths (Urdu runs longer than English — don't design tight English labels that break in Urdu).
- **Data display:** amounts are the star. Right-aligned, tabular numerals, thousands separators in the local convention, clear currency (Rs / روپے). Running balances always visible in ledgers.
- **Iconography:** simple, universally legible line icons. Avoid culturally-specific metaphors that won't read.

## 5. Localization & accessibility (non-negotiable)

- Full **RTL** layout for Urdu; mirror the entire UI, not just text.
- Bilingual labels with a language toggle; never leave English-only strings.
- Eastern Arabic numeral option.
- Large tap/click targets and ≥16px base text; support comfortable zoom.
- High contrast; color-blind-safe semantic pairs.
- Keyboard operability end-to-end on desktop (tab order, enter-to-save, shortcuts) **and** full touch operability on mobile (large targets, no hover-dependent actions, native mobile inputs).

## 6. Screens to design (information architecture)

Group into these flows. For each, design the default state plus the states listed in §8.

**A. Auth & onboarding**
- Login (per confirmed auth: password and/or OTP-to-phone).
- Store setup (name, address, contact, logo/watermark upload).
- **Opening-balance onboarding** — the migration wall. A guided flow to enter existing party balances (who owes what, what you owe) and opening stock and opening cash/bank, so day one reflects reality. Make this feel achievable, not a data-entry cliff. This is a high-stakes screen — invest in it.

**B. The hot path — Transaction entry** (see §7, design in depth)
- A single fast entry surface for: cash sale, credit (udhaar) sale, receipt (party pays), payment (pay a supplier), purchase, sale/purchase return, expense.
- Handles the mixed case (part cash, part udhaar) and split payment (part cash, part bank) in one entry.

**C. Cashbook** (روزنامچہ)
- Chronological cash & bank movements for a day/range. Opening balance → receipts/payments → closing balance.
- Each row reads as a story: "Received 50,000 from Rana," "Paid 60,000 to Crescent (part cash)." Filter by cash vs bank.
- The **nightly reconciliation** panel: system closing cash vs counted galla, with a satisfying match state and a calm, actionable mismatch state.

**D. Party ledgers / Khata**
- Party list: searchable, showing each party's current balance and which way it points (they owe you / you owe them), with aging cues (how old the outstanding is).
- Individual khata statement: running-balance ledger you could hand the party to reconcile — clean enough to print/share. Contact details in header.

**E. Inventory / Stock**
- Item list with current stock (in the item's unit — meter/than/piece), searchable by design number.
- Item detail: movement history (in/out), current quantity and value.
- Physical-count reconciliation view (system stock vs counted stock).

**F. Billing**
- Create/record a bill (this is often the entry point that also generates the transaction). Party, line items (design no., qty, rate, amount), discount/kaat, optional tax, total. Cash vs credit toggle.
- A clean printable/shareable bill using the store logo/watermark.

**G. Analytics dashboard (home)**
- Today's cash position AND today's profit, as two distinct cards (§3.4).
- Cash inflow/outflow trend, top parties (receivables/payables), top-selling designs, receivables aging.
- Multi-store owners: a comparison view across their stores (read-only rollup).

**H. Catalog & settings**
- Manage items (name, design no., unit, default sale/cost price, active/inactive).
- Store settings, language/numerals, users, subscription/plan status.

## 7. The hot path in depth — Transaction entry

This screen deserves the most design effort. Requirements:

- **One surface, event-type driven.** User picks what happened (sale / receipt / payment / purchase / return / expense); the form adapts. The user enters *one event*; they never enter accounting "sides."
- **Keyboard rhythm for batch mode:** tab through fields, type-ahead item search by design number, defaults that carry (same party/date across a run), enter-to-save, immediate "next entry" with focus returned to the first field. Mouse-optional.
- **Mixed/split money in one entry:** for a sale, capture "cash received" and "on udhaar" together; for a payment, "cash" and "bank/cheque" together. Show the running total reconciling so the user sees it balance.
- **Live-mode affordances:** quick, single-entry friendly; option to print/share a bill at the end.
- **Event date vs entry date:** let batch users backdate the event (bill was cut yesterday, entered tonight) without friction; default to today.
- **Instant feedback:** as they enter, show the consequence in their language — "Rana's baqaya will become 50,000," "cash in drawer +30,000," "stock: chamki −100m."
- **Correcting is easy:** review, edit, delete a just-entered transaction without ceremony (with the change tracked).

Design the empty state, a mid-entry state, a "mixed sale" example, and the just-saved confirmation.

## 8. States to design for every screen

Empty (no data yet / new store), loading, populated (realistic dense data — use believable cloth designs, party names, rupee amounts), error, and — where relevant — the reconciliation match vs mismatch states and the edit/confirm states.

## 9. Component & design-system requirements

Deliver a real system, not one-off screens:
- Design tokens: color (with semantic money-in/out, asset/liability, match/mismatch), type scale, spacing, radius.
- Core components: buttons, inputs, the fast entry field with type-ahead, tables/ledger rows with tabular numerals and running-balance column, amount display, party/balance card, stat card (cash vs profit), reconciliation panel, empty/loading/error blocks, bill/statement print layout.
- All components in Urdu (RTL) and English (LTR) variants.

## 10. Figma deliverable structure

- **Pages:** `Cover & principles`, `Design tokens`, `Components`, `Flows – Desktop`, `Flows – Mobile` (all flows, not just viewing), `Prototype`.
- Frames named by flow and state (e.g. `Entry / Mixed sale / mid-entry`).
- Build reusable components/variants, not detached copies. Use auto-layout so RTL/LTR and Urdu string lengths flex.
- Wire a clickable prototype for the two key journeys: (1) day-end batch entry of a few mixed transactions ending in nightly reconciliation, and (2) opening a party's khata from the dashboard.

## 11. Explicitly DO NOT

- Do **not** design a barcode/scan POS, product-grid tills, or anything that assumes automated item capture.
- Do **not** surface accounting jargon (debit, credit, journal, ledger-account) to the shopkeeper.
- Do **not** use decorative gradients, heavy shadows, or a generic SaaS-dashboard template look.
- Do **not** design English-only; do not design tight English labels that break under longer Urdu strings.
- Do **not** treat cash position and profit as the same number.
- Do **not** hide or make scary the ability to edit/correct an entry.

## 12. Domain glossary (use these terms correctly in the UI)

- **Khata** — a party's running account/ledger.
- **Party** — a customer or supplier you trade with (can be both).
- **Baqaya** — outstanding balance owed.
- **Udhaar** — credit / buying-selling on credit.
- **Galla** — the physical cash drawer.
- **Cashbook (روزنامچہ)** — the daily record of cash/bank in and out.
- **Than / gaz / meter** — cloth units (a than is a roll/bolt; gaz ≈ yard). Items are stocked and sold in these.
- **Kaat** — trade discount.
- **Design number** — the code by which cloth is identified and searched (primary lookup key).

---

*Deliver: a Figma file with the pages above, a coherent component library, RTL+LTR support, realistic dense sample data, and two prototyped journeys. Optimize above all for the speed and trustworthiness of daily transaction entry.*
