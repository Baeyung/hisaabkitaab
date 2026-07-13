#!/usr/bin/env bash
#
# Loads dummy data into HisaabKitaab through the REST API.
#
# Order (each step depends on IDs returned by the previous one):
#   1. Sign up users        POST /api/auth/signup      (public)
#   2. Create their stores   POST /api/stores           (basic auth)
#   3. Create parties        POST /api/parties          (basic auth)
#   4. Create store items    POST /api/store-items      (basic auth)
#   5. Publish SALE/PURCHASE POST /api/event            (basic auth, as the owner's EMAIL)
#
# Requirements: bash + curl. No jq/python needed.
#
# Usage:
#   ./load-dummy-data.sh
#   BASE_URL=http://localhost:8080 PASSWORD=password123 ./load-dummy-data.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
PASSWORD="${PASSWORD:-password123}"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
info() { printf '    \033[0;90m%s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# Pull the first "id":"..." out of a JSON response body.
extract_id() {
  grep -o '"id":"[^"]*"' | head -n1 | sed 's/^"id":"//; s/"$//'
}

# POST public (no auth). args: <path> <json>
post_public() {
  curl -sS -X POST "$BASE_URL$1" -H 'Content-Type: application/json' -d "$2"
}

# POST with HTTP basic auth. args: <user> <path> <json>
post_auth() {
  curl -sS -X POST "$BASE_URL$2" -u "$1:$PASSWORD" \
    -H 'Content-Type: application/json' -d "$3"
}

# ---------------------------------------------------------------------------
# preflight
# ---------------------------------------------------------------------------
command -v curl >/dev/null 2>&1 || die "curl is not installed."
say "Checking server at $BASE_URL"
curl -sS -o /dev/null "$BASE_URL/api/users" -u "preflight:preflight" \
  || die "Cannot reach $BASE_URL. Is the backend running?"
info "Server reachable."

# ---------------------------------------------------------------------------
# 1. Users
# ---------------------------------------------------------------------------
say "Creating users"

ALI_EMAIL="ali@example.com"
resp=$(post_public /api/auth/signup \
  "{\"name\":\"Ali Hassan\",\"contactNumber\":\"03001112233\",\"email\":\"$ALI_EMAIL\",\"password\":\"$PASSWORD\"}")
ALI_ID=$(printf '%s' "$resp" | extract_id)
[ -n "$ALI_ID" ] || die "User signup failed: $resp"
info "Ali Hassan  -> $ALI_ID  ($ALI_EMAIL)"

SARA_EMAIL="sara@example.com"
resp=$(post_public /api/auth/signup \
  "{\"name\":\"Sara Khan\",\"contactNumber\":\"03004445566\",\"email\":\"$SARA_EMAIL\",\"password\":\"$PASSWORD\"}")
SARA_ID=$(printf '%s' "$resp" | extract_id)
[ -n "$SARA_ID" ] || die "User signup failed: $resp"
info "Sara Khan   -> $SARA_ID  ($SARA_EMAIL)"

# ---------------------------------------------------------------------------
# 2. Stores  (one per user; /api/event resolves the owner's FIRST store)
# ---------------------------------------------------------------------------
say "Creating stores"

resp=$(post_auth "$ALI_EMAIL" /api/stores \
  "{\"ownerId\":\"$ALI_ID\",\"name\":\"Ali General Store\",\"address\":\"Main Bazaar, Lahore\",\"contact\":\"0421234567\"}")
ALI_STORE=$(printf '%s' "$resp" | extract_id)
[ -n "$ALI_STORE" ] || die "Store create failed: $resp"
info "Ali General Store -> $ALI_STORE"

resp=$(post_auth "$SARA_EMAIL" /api/stores \
  "{\"ownerId\":\"$SARA_ID\",\"name\":\"Sara Mart\",\"address\":\"Saddar, Karachi\",\"contact\":\"0219876543\"}")
SARA_STORE=$(printf '%s' "$resp" | extract_id)
[ -n "$SARA_STORE" ] || die "Store create failed: $resp"
info "Sara Mart -> $SARA_STORE"

# ---------------------------------------------------------------------------
# 3. Parties
# ---------------------------------------------------------------------------
say "Creating parties"

mk_party() { # <owner_email> <store_id> <name> <contact>
  post_auth "$1" /api/parties \
    "{\"storeId\":\"$2\",\"name\":\"$3\",\"contact\":\"$4\",\"address\":\"\"}" | extract_id
}

ALI_PARTY_CUST=$(mk_party "$ALI_EMAIL" "$ALI_STORE" "Bilal Traders" "03111111111")
ALI_PARTY_SUPP=$(mk_party "$ALI_EMAIL" "$ALI_STORE" "Usman Wholesale" "03122222222")
info "Ali: Bilal Traders -> $ALI_PARTY_CUST | Usman Wholesale -> $ALI_PARTY_SUPP"

SARA_PARTY_CUST=$(mk_party "$SARA_EMAIL" "$SARA_STORE" "Kamran Retail" "03133333333")
SARA_PARTY_SUPP=$(mk_party "$SARA_EMAIL" "$SARA_STORE" "Faisal Distributors" "03144444444")
info "Sara: Kamran Retail -> $SARA_PARTY_CUST | Faisal Distributors -> $SARA_PARTY_SUPP"

# ---------------------------------------------------------------------------
# 4. Store items
# ---------------------------------------------------------------------------
say "Creating store items"

mk_item() { # <owner_email> <store_id> <name> <unit> <salePrice> <costPrice>
  post_auth "$1" /api/store-items \
    "{\"storeId\":\"$2\",\"name\":\"$3\",\"unit\":\"$4\",\"salePrice\":$5,\"costPrice\":$6}" | extract_id
}

ALI_ITEM_SUGAR=$(mk_item "$ALI_EMAIL" "$ALI_STORE" "Sugar" "kg"  120 100)
ALI_ITEM_FLOUR=$(mk_item "$ALI_EMAIL" "$ALI_STORE" "Flour" "kg"  90  75)
ALI_ITEM_RICE=$(mk_item  "$ALI_EMAIL" "$ALI_STORE" "Rice"  "kg"  200 170)
info "Ali items: Sugar $ALI_ITEM_SUGAR | Flour $ALI_ITEM_FLOUR | Rice $ALI_ITEM_RICE"

SARA_ITEM_OIL=$(mk_item "$SARA_EMAIL" "$SARA_STORE" "Cooking Oil" "litre" 550 500)
SARA_ITEM_TEA=$(mk_item "$SARA_EMAIL" "$SARA_STORE" "Tea"         "packet" 400 350)
SARA_ITEM_SALT=$(mk_item "$SARA_EMAIL" "$SARA_STORE" "Salt"       "kg"    40  30)
info "Sara items: Oil $SARA_ITEM_OIL | Tea $SARA_ITEM_TEA | Salt $SARA_ITEM_SALT"

# ---------------------------------------------------------------------------
# 5. Events. SALE/PURCHASE carry a party + item; RECEIPT/PAYMENT carry a party
#    only; EXPENSE carries neither -- all are supported.
#    NOTE: the event has no storeId -- EventService resolves the owner's store
#    from the login identifier, which may be the owner's email OR contact number.
# ---------------------------------------------------------------------------
say "Publishing events"

publish_event() { # <owner_email> <json>
  post_auth "$1" /api/event "$2" >/dev/null && info "  ok" || die "event failed"
}

# Ali: SALE of 10kg sugar, bill 1200, customer paid 1000 (200 stays on party).
publish_event "$ALI_EMAIL" "{
  \"transactionEvent\":\"SALE\",
  \"cashAmount\":1000,\"billAmount\":1200,
  \"description\":\"Sugar sale to Bilal Traders\",
  \"billNumber\":\"ALI-INV-001\",\"billDate\":\"2026-07-14\",
  \"party\":{\"partyId\":\"$ALI_PARTY_CUST\",\"name\":\"Bilal Traders\"},
  \"item\":{\"itemId\":\"$ALI_ITEM_SUGAR\",\"name\":\"Sugar\",\"quantity\":10}
}"

# Ali: PURCHASE of 50kg flour, bill 3750, paid in full.
publish_event "$ALI_EMAIL" "{
  \"transactionEvent\":\"PURCHASE\",
  \"cashAmount\":3750,\"billAmount\":3750,
  \"description\":\"Flour purchase from Usman Wholesale\",
  \"billNumber\":\"ALI-PUR-001\",\"billDate\":\"2026-07-13\",
  \"party\":{\"partyId\":\"$ALI_PARTY_SUPP\",\"name\":\"Usman Wholesale\"},
  \"item\":{\"itemId\":\"$ALI_ITEM_FLOUR\",\"name\":\"Flour\",\"quantity\":50}
}"

# Sara: SALE of 5 litre oil, bill 2750, paid in full.
publish_event "$SARA_EMAIL" "{
  \"transactionEvent\":\"SALE\",
  \"cashAmount\":2750,\"billAmount\":2750,
  \"description\":\"Cooking oil sale to Kamran Retail\",
  \"billNumber\":\"SARA-INV-001\",\"billDate\":\"2026-07-14\",
  \"party\":{\"partyId\":\"$SARA_PARTY_CUST\",\"name\":\"Kamran Retail\"},
  \"item\":{\"itemId\":\"$SARA_ITEM_OIL\",\"name\":\"Cooking Oil\",\"quantity\":5}
}"

# Sara: PURCHASE of 20 packets tea, bill 7000, paid 5000 (2000 owed).
publish_event "$SARA_EMAIL" "{
  \"transactionEvent\":\"PURCHASE\",
  \"cashAmount\":5000,\"billAmount\":7000,
  \"description\":\"Tea purchase from Faisal Distributors\",
  \"billNumber\":\"SARA-PUR-001\",\"billDate\":\"2026-07-12\",
  \"party\":{\"partyId\":\"$SARA_PARTY_SUPP\",\"name\":\"Faisal Distributors\"},
  \"item\":{\"itemId\":\"$SARA_ITEM_TEA\",\"name\":\"Tea\",\"quantity\":20}
}"

# Ali: EXPENSE -- shop electricity bill (cash out only, no party/item).
publish_event "$ALI_EMAIL" "{
  \"transactionEvent\":\"EXPENSE\",
  \"cashAmount\":800,
  \"description\":\"Shop electricity bill\",
  \"billNumber\":\"ALI-EXP-001\",\"billDate\":\"2026-07-14\"
}"

# Ali: RECEIPT -- Bilal Traders clears the 200 they owed (cash in + party, no item).
publish_event "$ALI_EMAIL" "{
  \"transactionEvent\":\"RECEIPT\",
  \"cashAmount\":200,
  \"description\":\"Balance received from Bilal Traders\",
  \"billNumber\":\"ALI-RCP-001\",\"billDate\":\"2026-07-15\",
  \"party\":{\"partyId\":\"$ALI_PARTY_CUST\",\"name\":\"Bilal Traders\"}
}"

# Sara: PAYMENT -- pay Faisal Distributors the 2000 owed (cash out + party, no item).
publish_event "$SARA_EMAIL" "{
  \"transactionEvent\":\"PAYMENT\",
  \"cashAmount\":2000,
  \"description\":\"Payment to Faisal Distributors\",
  \"billNumber\":\"SARA-PAY-001\",\"billDate\":\"2026-07-15\",
  \"party\":{\"partyId\":\"$SARA_PARTY_SUPP\",\"name\":\"Faisal Distributors\"}
}"

say "Done. Dummy data loaded successfully."
