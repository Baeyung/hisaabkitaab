# HisaabKitaab API — ingestion guide

Two files live here:

| File | What it is |
|---|---|
| `openapi.yaml` | OpenAPI 3.1 spec for the whole backend. Hand-written — there is no springdoc on the classpath, so this file is the contract. If a controller changes, change this too. |
| `README.md` (this file) | The narrative an LLM or a human needs *before* writing an importer: the model, the order, and the traps the schema alone will not tell you. |

Feed both to whatever is writing the migration. The spec answers "what shape"; this answers "in what order, and what will bite me".

**Scope.** `openapi.yaml` covers everything a customer-facing client or an importer touches: auth, stores, parties, items, openings, entries, processing, the derived reads, units, expense heads, members, and `GET /plan/me`. Deliberately left out, because none of it is reachable from an ordinary account or relevant to ingestion: the admin back office (`/api/admin/**`, `ROLE_ADMIN`), the dev tools controller, the token-gated report render pages (`/api/reports/**`), the WhatsApp share/webhook/opt-out endpoints, and the plan overage endpoints. Add them here if that changes.

---

## 1. The model, in one paragraph

**Nothing in this system stores a balance.** There is no `balance` column on a party, no `quantity` column on an item, no cash total anywhere. Every khata balance, every stock figure and every drawer number is folded at read time from `transaction_line` rows. You never write a balance — you write the *event* that moved it, and the read endpoints re-derive.

```
POST /event  ──▶  transaction ──▶ lines (CASH / PARTY / STOCK)
                                     │
                                     └─▶ folded at read time by
                                         /ledger, /inventory, /cashbook, /dashboard
```

Three consequences that shape the whole importer:

1. **No idempotency, anywhere.** Posting the same bill twice does not overwrite — it doubles the khata. Re-running a failed import from the top doubles everything it already wrote. The importer owns dedupe and owns its own resume checkpoint.
2. **Deletes are clean.** `DELETE /event/{id}` removes the lines and every balance re-derives without them. That makes rollback cheap and makes "delete the party, re-import it" a legitimate repair.
3. **Order between entries does not matter for correctness** — balances are sums, not fold-left state. It only matters for the running-balance *columns* in statements, which sort by `billDate` then `occurredAt`. Post in chronological order anyway; it makes the statements read naturally.

---

## 2. Ingestion order

Do these in sequence. Each step depends on ids from the one above.

```
1. authenticate            GET  /api/auth/me                          ← verify credentials work
2. check the plan          GET  /api/plan/me                          ← maxStores/maxUsers are enforced
3. create the store        POST /api/stores                           → storeId
4. resolve parties         GET  /api/stores/{s}/parties               → name → partyId map
                           POST /api/stores/{s}/parties               ← only the missing ones
5. resolve items           GET  /api/stores/{s}/store-items           → name → itemId map
                           POST /api/stores/{s}/store-items           ← only the missing ones
6. carry in openings       PUT  .../parties/{id}/opening-balance
                           PUT  .../store-items/{id}/opening-stock
                           PUT  .../opening-cash
7. post history            POST /api/stores/{s}/event                 ← one call per entry
8. reconcile               GET  /ledger, /inventory, /cashbook
```

Steps 4 and 5 are non-negotiable prerequisites for step 7. See trap #1.

### Step 3 — the store

```bash
curl -u "$USER:$PASS" -X POST http://localhost:8080/api/stores \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ahmad Cloth House","address":"Shah Alam Market","contact":"3001234567"}'
```

`contact` is digits only, 7–15 of them. `+92 300 123 4567` is rejected — normalise before sending. The response is a `StoreSummary`; keep `id`.

### Steps 4–5 — the catalogue: resolve, *then* create

This is the step that decides whether the import is clean, so it gets the most space. The rule is one line:

> **Always GET the catalogue first, match on a normalised name, and only POST what genuinely isn't there.**

Never POST a party or item without having looked first. The backend has no name uniqueness, no upsert, no `GET ?name=` search — so a blind POST always succeeds and always creates a second record.

#### The two lookup calls

There is exactly one lookup endpoint per catalogue, and it returns **everything** — no query parameters, no pagination, no search. That is a feature here: one call per catalogue gives you the whole map.

| Call | Returns | Fields you need |
|---|---|---|
| `GET /api/stores/{storeId}/parties` | every party in the store | `id`, `name`, `contact`, `address`, `openingBalance` |
| `GET /api/stores/{storeId}/store-items` | every item in the store | `id`, `name`, `unit`, `salePrice`, `costPrice`, `openingStock`, `service` |

```bash
curl -u "$USER:$PASS" -H 'Accept: application/json' \
  "http://localhost:8080/api/stores/$STORE_ID/parties"
```

```json
[
  { "id": "0f0a1b2c-…", "name": "Ali Traders", "contact": "3001234567",
    "address": "Shah Alam", "openingBalance": { "amount": 45000, "direction": "THEY_OWE_YOU" } },
  { "id": "77ab8c9d-…", "name": "Karachi Mills", "contact": "090078601",
    "address": "address@HisaabKitaab", "openingBalance": null }
]
```

Two things to read out of that second row: `090078601` is the **placeholder contact** stamped on a party the backend auto-created from a name on some earlier entry, and `address@HisaabKitaab` is its placeholder address. Both are a signal that the row was born from trap #1 rather than entered deliberately — worth flagging to whoever is running the migration, and worth fixing with `PUT /parties/{id}` once you know the real number.

If you only need to confirm that one id is still live and in this store, `GET /parties/{id}` and `GET /store-items/{id}` do that — they return the record, or `404` if the id belongs to another store or no longer exists. They are not a search; you cannot pass a name.

#### The resolve-or-create loop

```python
def normalise(name: str) -> str:
    """Whatever this source system's data demands. The backend does NONE of this."""
    return " ".join(name.split()).casefold()

def build_party_map(sid: str) -> dict[str, str]:
    """normalised name → party id, for everything already in the store."""
    existing = call("GET", f"/api/stores/{sid}/parties")
    m: dict[str, str] = {}
    for p in existing:
        key = normalise(p["name"])
        if key in m:
            # Real duplicates already in the store (see trap #1). Keep the first
            # deterministically so re-runs agree, and surface it — do not merge silently.
            report_duplicate(key, m[key], p["id"])
            continue
        m[key] = p["id"]
    return m

party_ids = build_party_map(sid)

for p in source.parties():
    key = normalise(p["name"])
    if key in party_ids:
        continue                                   # already there — do not POST
    created = call("POST", f"/api/stores/{sid}/parties",
                   {"name": p["name"],             # store the source's own casing
                    "contact": digits_only(p["contact"]),
                    "address": p["address"]})
    party_ids[key] = created["id"]                 # add to the map immediately
```

Items are the same shape against `/store-items`, with `unit`, `salePrice`, `costPrice` and `service` on the create body.

Four details that make this actually safe:

* **Add to the map immediately after creating.** If the source list has "Ali Traders" twice with different spellings that normalise the same, the second pass must see the first one's id.
* **Build the map once, up front** — not one GET per lookup. The list endpoint returns the whole catalogue, and a store has hundreds of parties, not millions.
* **Match on the normalised key, but POST the source's original casing.** The shopkeeper should see their own spelling in the app.
* **`normalise` is yours to own.** Case-folding and whitespace collapsing are the safe minimum. Going further — stripping "Bhai"/"Sahib", dropping punctuation, transliterating — starts merging parties that are genuinely different people, so if the source data needs that, have a human confirm the merge list before the import runs.

#### Re-running is safe

Because the loop resolves before it creates, running steps 4–5 twice is a no-op the second time: the GET returns what the first run wrote, every name matches, nothing is posted. That is the only part of the import with that property — steps 6 (upserts) and 7 (§1: no idempotency) do not share it.

#### Verifying no duplicates were created

After steps 4–5, before posting any history:

```python
parties = call("GET", f"/api/stores/{sid}/parties")
keys = [normalise(p["name"]) for p in parties]
dupes = {k for k in keys if keys.count(k) > 1}
assert not dupes, f"duplicate parties in store: {dupes}"
```

Cheap, and it catches the failure mode while it is still one `DELETE /parties/{id}` away from being fixed. Once history is posted on top of a duplicate, untangling it means deleting the party — which cascades every transaction that referenced it.

### Step 6 — openings

This is how "what they already owed on day one" and "what was on the shelf on day one" come across. All three are idempotent upserts — safe to re-run, and `0` clears.

```bash
# Party carried in a 45,000 receivable
curl -u "$USER:$PASS" -X PUT ".../parties/$PARTY_ID/opening-balance" \
  -H 'Content-Type: application/json' \
  -d '{"amount":45000,"direction":"THEY_OWE_YOU"}'

# 120 gaz on the shelf
curl -u "$USER:$PASS" -X PUT ".../store-items/$ITEM_ID/opening-stock" \
  -H 'Content-Type: application/json' -d '{"quantity":120}'

# 8,000 in the drawer
curl -u "$USER:$PASS" -X PUT ".../opening-cash" \
  -H 'Content-Type: application/json' -d '{"amount":8000}'
```

`amount` is always **positive** — the sign lives in `direction` (`THEY_OWE_YOU` / `YOU_OWE_THEM`). This is the app's whole vocabulary for balances; there is no debit/credit anywhere.

**Do not model an opening as a backdated SALE or PURCHASE.** A backdated sale would also move stock and put cash in the drawer on a day the shop was not using this system. The opening endpoints write single-sided transactions on purpose.

**Decide once: openings *or* full history, not both.** If you import every transaction back to the beginning, the balances derive themselves and an opening on top double-counts. Openings are for the common case — carrying in a closing position and starting fresh, or importing only the last N months.

### Step 7 — the history

One `POST /event` per entry. Which fields the backend actually reads depends on `transactionEvent`:

| Event | cash | party | stock | Reads |
|---|---|---|---|---|
| `SALE` | IN | derived | OUT | `cashAmount`, `billAmount`, `party`, `items[]` |
| `PURCHASE` | OUT | derived | IN | `cashAmount`, `billAmount`, `party`, `items[]` |
| `RECEIPT` | IN | OUT | — | `cashAmount`, `party` |
| `PAYMENT` | OUT | IN | — | `cashAmount`, `party` |
| `EXPENSE` | OUT | — | — | `cashAmount`, `expenseCategory` |

**The khata line on a SALE/PURCHASE is derived, never sent.** The backend computes `|billAmount − cashAmount|` and picks the direction from the sign. So:

| Source row | `billAmount` | `cashAmount` | Result |
|---|---|---|---|
| Cash sale, 4,500 | 4500 | 4500 | Nothing on the khata |
| Sale 5,000, took 2,000 | 5000 | 2000 | 3,000 → `THEY_OWE_YOU` |
| Sale 5,000, all udhaar | 5000 | 0 | 5,000 → `THEY_OWE_YOU` |
| Purchase 12,000, paid nothing | 12000 | 0 | 12,000 → `YOU_OWE_THEM` |
| Customer pays 3,000 later | — | 3000 | `RECEIPT`, clears 3,000 of baqaya |

Set `billDate` to the **source system's business date**. Backdating is fully supported and is what every report, statement and cashbook range keys on. You cannot backdate `entryDate` or `createdAt` — those are stamped server-side.

---

## 3. Traps

These are the ones that will actually cost you an afternoon. Numbered so a review can point at them.

### #1 — A name without an id creates a new record *every single time*

`party.partyId` and `items[].itemId` are the real reference. If either is blank, the backend calls `resolveOrCreate`, which **does not look the name up** — it creates a fresh record. Import 200 bills for "Ali Traders" without a `partyId` and you get 200 parties named "Ali Traders", each holding one bill's worth of khata, and a ledger nobody can read.

Same for items, which additionally land with unit `"gz"` and zero prices.

> Always resolve to ids in steps 4–5, and always send `partyId` / `itemId`. Send `name` too if you like — it is ignored when the id is present.

The whole defence is the resolve-or-create loop in [Steps 4–5](#steps-45--the-catalogue-resolve-then-create): `GET /parties` and `GET /store-items` once, build a normalised `name → id` map, POST only what is missing, and never let a name reach `POST /event` without an id beside it. There is no server-side search endpoint to look a name up mid-import — the full-list GET *is* the lookup, which is why it is built into a map up front rather than called per row.

Spotting it after the fact: parties with the placeholder contact `090078601` and address `address@HisaabKitaab` were auto-created rather than entered, and near-duplicate names in `GET /parties` are the other tell.

### #2 — `cashAmount` is required in practice on every event

The schema marks it optional; the code dereferences it unboxed. `null` is a **500**, not a validation error. Send `0` for a fully-credit entry. Same for `billAmount` on `SALE`/`PURCHASE`.

A negative `cashAmount` is not an error either — it is silently skipped and *no cash line is written*, which is worse than a failure because the import looks like it worked.

### #3 — `billAmount` must equal Σ(`quantity` × `itemSoldAt`)

The khata split is computed from `billAmount` at write time; the read side re-totals the item lines independently. If they disagree, the bill's goods total and its outstanding figure tell different stories and nothing flags it.

If the source has a bill-level discount, decide explicitly: fold it into the line rates, or leave `billAmount` as the pre-discount sum and record the discount as a separate entry. Do not just lower `billAmount`.

### #4 — Five event types silently do nothing

`PROCESSING`, `ADJUSTMENT`, `OPENING_BALANCE`, `OPENING_STOCK` and `OPENING_CASH` have **no processor registered**. Posting one to `/event` returns `200` with your body echoed back and writes *nothing at all*. Openings go through their own `PUT` endpoints; processing goes through `POST /processing`; `ADJUSTMENT` has no write path in this release — model a stock or cash correction as whatever it really was, or leave it out and note the gap.

This is the single most dangerous trap here, because the response looks like success.

### #5 — The POST response does not carry the new id

`POST /event` echoes the request. To get transaction ids back, read them from `GET /transactions/bills`, `/transactions/purchases`, `/cashbook` or `/ledger/{partyId}` afterwards, matching on `billNumber` + `date`. Plan for this if the importer needs to write ids back into the source system.

### #6 — Contact numbers are digits only

`^(\d{7,15})?$` — blank or 7–15 digits, on stores and parties alike. `+92`, spaces, dashes and parentheses all fail validation with a `400`. Normalise in the importer. (A party the backend auto-creates gets the placeholder `090078601`, which is nobody's number and must never be messaged — another reason to create parties properly in step 4.)

### #7 — No bulk endpoints, no transactions across calls

One HTTP call per record, and each is committed on its own. A failure halfway leaves everything before it written, and there is no idempotency to save you on the retry (§1). Keep a per-record checkpoint so a resume picks up where it stopped instead of re-posting.

The only batching affordance in the API is `POST /transactions/bills/details` (and its purchases twin), which takes a list of ids and returns their details. It writes nothing; it is for verification.

### #8 — Rollback needs the owner

`DELETE /event/{id}` lets a non-owner delete only entries booked in the last 24 hours, measured on the server-side `createdAt`. Run imports and rollbacks as the shop's **owner** account, or a botched import older than a day becomes undeletable through the API.

The blunt instruments, in increasing order of violence:

* `DELETE /parties/{id}` — **cascades**: deletes every transaction referencing that party. Good for redoing one party's history.
* `DELETE /store-items/{id}` — cascades the same way over every transaction that used the item.
* `DELETE /stores/{storeId}` — the store and everything in it. Owner only, irreversible.

### #9 — A plan-suspended shop is read-only

If the owner's plan stops covering a shop, every write returns `403` with a message written to be shown to the user verbatim. Reads keep working. Check `GET /plan/me` (`enforced`, `limits`, `usage`) before a long import — and note that `enforced: false` means limits are reported but nothing is actually refused.

### #10 — Expense heads are created by name, implicitly

There is no POST for expense categories. Posting an `EXPENSE` with an `expenseCategory` the store has not seen creates it. A blank one files under `UNCATEGORIZED`. `GET /expense-categories` lists the names — read it first and map the source system's heads onto the existing ones where they match, or the store ends up with "bijli", "Bijli" and "electricity" as three separate heads.

---

## 4. Mapping a typical legacy export

A rough guide from the shapes these migrations usually arrive in:

| Source concept | Goes to |
|---|---|
| Customer / supplier master | `POST /parties` (one row each — a party is both) |
| Item / product master | `POST /store-items` |
| Service or labour charge in the item master | `POST /store-items` with `service: true` — it keeps no stock |
| Opening receivable / payable per party | `PUT /parties/{id}/opening-balance` |
| Opening stock per item | `PUT /store-items/{id}/opening-stock` |
| Cash in hand at cutover | `PUT /opening-cash` |
| Sales invoice | `POST /event` `SALE`, lines in `items[]`, cash taken in `cashAmount` |
| Purchase invoice | `POST /event` `PURCHASE` |
| Customer payment received | `POST /event` `RECEIPT` |
| Payment made to supplier | `POST /event` `PAYMENT` |
| Expense voucher | `POST /event` `EXPENSE` + `expenseCategory` |
| Credit note / return | No native path. Model as an opposite-direction entry and say so in `description`. |
| Stock adjustment / shrinkage | No write path (`ADJUSTMENT` is inert). Note the gap; the closing stock will differ by the adjustments you drop. |
| Unit conversions (than → gaz) | `PUT /unit-conversions` |

---

## 5. Reconciling afterwards

Four reads answer "did it land":

```bash
GET /api/stores/{s}/ledger                 # every party's closing balance
GET /api/stores/{s}/inventory              # on-hand stock per item
GET /api/stores/{s}/cashbook?from=…&to=…   # drawer movements, with opening and closing
GET /api/stores/{s}/dashboard?from=…&to=…  # sales/spend totals over a window
```

The checks worth automating:

1. **Party balances.** `/ledger` against the source's closing khata, per party. `PartyBalance` is `{amount, direction}` with a non-negative amount — compare direction, not sign. Anything under 0.005 reads as `SETTLED`.
2. **Row counts.** `/transactions/bills` and `/transactions/purchases` lengths against the source's invoice counts. A mismatch here usually means a swallowed 500.
3. **Stock.** `/inventory` per item. `currentStock` is `null` for a service item — that is correct, not a gap.
4. **Duplicate parties/items.** `GET /parties` and look for near-duplicate names. This is how trap #1 shows up.
5. **Cash.** `/cashbook` over the full imported range: `openingBalance` should be your opening-cash figure and `closingBalance` should match the source's.

A per-bill check is available too — collect ids from `/transactions/bills`, then `POST /transactions/bills/details` with a batch of them and compare `goodsTotal`, `cashReceived` and `outstanding` line by line.

---

## 6. A skeleton importer

```python
import requests

BASE  = "http://localhost:8080"
AUTH  = ("03001234567", "…")          # contact number or email, and password
S     = requests.Session(); S.auth = AUTH

def call(method, path, body=None):
    r = S.request(method, BASE + path, json=body)
    if not r.ok:
        raise RuntimeError(f"{method} {path} → {r.status_code} {r.text}")
    return r.json() if r.content else None

def normalise(name): return " ".join(name.split()).casefold()

store = call("POST", "/api/stores", {"name": "Ahmad Cloth House"})
sid   = store["id"]

# 1. catalogue first — resolve against what is already there, then create the gaps.
#    One GET each; the list endpoints take no search params and return everything.
def resolve_or_create(path, source_rows, body_of):
    """normalised name → id. Never POSTs a name the store already has (trap #1)."""
    ids = {}
    for row in call("GET", path):                    # everything already in the store
        ids.setdefault(normalise(row["name"]), row["id"])
    for row in source_rows:
        key = normalise(row["name"])
        if key not in ids:                           # only what is genuinely missing
            ids[key] = call("POST", path, body_of(row))["id"]
    return ids

parties = resolve_or_create(
    f"/api/stores/{sid}/parties", source.parties(),
    lambda p: {"name": p["name"], "contact": digits_only(p["contact"])})

items = resolve_or_create(
    f"/api/stores/{sid}/store-items", source.items(),
    lambda i: {"name": i["name"], "unit": i["unit"],
               "salePrice": i["sale"], "costPrice": i["cost"]})

# 2. openings — idempotent upserts, safe to re-run
for p in source.parties():
    if p["opening"]:
        pid = parties[normalise(p["name"])]
        call("PUT", f"/api/stores/{sid}/parties/{pid}/opening-balance",
             {"amount": abs(p["opening"]),
              "direction": "THEY_OWE_YOU" if p["opening"] > 0 else "YOU_OWE_THEM"})

# 3. history, chronological, one call each, checkpointed
for row in sorted(source.entries(), key=lambda r: r["date"]):
    if checkpoint.done(row["id"]):        # no idempotency server-side — this is on us
        continue
    lines = [{"itemId": items[normalise(l["item"])],   # id, never a bare name (trap #1)
              "quantity": l["qty"], "itemSoldAt": l["rate"]}
             for l in row["lines"]]
    call("POST", f"/api/stores/{sid}/event", {
        "transactionEvent": row["type"],                    # SALE / PURCHASE / RECEIPT / PAYMENT / EXPENSE
        "billNumber": row["number"],
        "billDate":   row["date"].isoformat(),              # backdated — this is the business date
        "cashAmount": row["cash"] or 0,                     # never null (trap #2)
        "billAmount": sum(l["qty"] * l["rate"] for l in row["lines"]),  # must match Σ (trap #3)
        "party": {"partyId": parties[normalise(row["party"])]} if row["party"] else None,
        "items": lines,
    })
    checkpoint.mark(row["id"])
```

---

## 7. Keeping this file honest

The spec is hand-maintained. When a controller under `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/controller/` gains, loses or changes an endpoint, update `openapi.yaml` in the same change. The behavioural notes here come from the services behind those controllers — `EventService`, the `processors/` package, `OpeningEntryService`, `CurrentStoreArgumentResolver` — so a change in any of those is a reason to re-read this file too.

Traps #2 and #4 in particular describe *current* behaviour, not intended behaviour. If either is ever fixed, delete the trap rather than leaving a warning about something that no longer happens.
