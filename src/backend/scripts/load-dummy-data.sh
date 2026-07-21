#!/usr/bin/env bash
#
# Seeds dummy data into HisaabKitaab through the REST API for a single, fixed
# test account. Re-run it any time you need fresh data -- parties and items
# are matched by name and only created if missing, so re-running just stacks
# more transactions on top instead of duplicating your master data.
#
# Order (each step depends on IDs returned by the previous one):
#   1. Sign up test@test.com   POST /api/auth/signup      (public; ok if it already exists)
#   2. Ensure a store exists    POST /api/stores           (basic auth)
#   3. Ensure 7 parties exist   POST /api/parties          (basic auth)
#   4. Ensure 20 items exist    POST /api/store-items      (basic auth)
#   5. Publish ~46 entries      POST /api/event            (basic auth) across
#      SALE, PURCHASE, RECEIPT, PAYMENT and EXPENSE, spread over the last 30 days.
#      Several are multi-line; expenses carry a spend category; and one customer
#      (Adeel) has three unpaid bills cleared oldest-first by a single lump receipt,
#      so the party-report FIFO "Paid" marking has something to show.
#
# Adding more next time: use the line/txn/settle/expense helpers below -- each
# entry is a single call, so extending this dataset is a one-liner.
#
# Requirements: bash + curl + jq.
#
# Usage:
#   ./load-dummy-data.sh
#   BASE_URL=http://localhost:8080 EMAIL=test@test.com PASSWORD=test ./load-dummy-data.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
EMAIL="${EMAIL:-test@test.com}"
PASSWORD="${PASSWORD:-test}"
CONTACT_NUMBER="${CONTACT_NUMBER:-03000000000}"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
info() { printf '    \033[0;90m%s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# GET/POST as $EMAIL:$PASSWORD. args: <method> <path> [json_body]
# Echoes "<body>\n<http_code>" -- use code_of/body_of to split it. (Can't set a
# global http-code variable here: $(req ...) runs this in a subshell, so any
# plain variable assignment inside would vanish once the subshell exits.)
req() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -sS -w $'\n%{http_code}' -X "$method" "$BASE_URL$path" \
      -u "$EMAIL:$PASSWORD" -H 'Content-Type: application/json' -d "$data"
  else
    curl -sS -w $'\n%{http_code}' -X "$method" "$BASE_URL$path" -u "$EMAIL:$PASSWORD"
  fi
}

code_of() { printf '%s' "$1" | tail -n1; }
body_of() { printf '%s' "$1" | sed '$d'; }

publish_event() { # <json>
  local resp code body
  resp=$(req POST /api/event "$1")
  code=$(code_of "$resp"); body=$(body_of "$resp")
  [ "$code" = "200" ] || die "event failed (HTTP $code): $body"
}

# One item line for a SALE/PURCHASE. args: <itemId> <name> <qty> <rate>
line() { printf '{"itemId":"%s","name":"%s","quantity":%s,"itemSoldAt":%s}' "$1" "$2" "$3" "$4"; }

# SALE or PURCHASE with items. args:
#   <event> <cash> <billAmount> <days_ago> <billNo> <desc> <partyId> <partyName> <itemsJson>
# billAmount must equal Σ(qty×rate) of the lines (the backend recomputes goods total from them).
txn() {
  publish_event "{\"transactionEvent\":\"$1\",\"cashAmount\":$2,\"billAmount\":$3,\"description\":\"$6\",\"billNumber\":\"$5\",\"billDate\":\"$(days_ago "$4")\",\"party\":{\"partyId\":\"$7\",\"name\":\"$8\"},\"items\":[$9]}"
  info "$5 ($8)"
}

# RECEIPT or PAYMENT against a party (cash only, no items). args:
#   <event> <cash> <days_ago> <billNo> <desc> <partyId> <partyName>
settle() {
  publish_event "{\"transactionEvent\":\"$1\",\"cashAmount\":$2,\"description\":\"$5\",\"billNumber\":\"$4\",\"billDate\":\"$(days_ago "$3")\",\"party\":{\"partyId\":\"$6\",\"name\":\"$7\"}}"
  info "$4 ($7)"
}

# EXPENSE (cash out, no party/item, tagged with a spend category). args:
#   <cash> <days_ago> <billNo> <desc> <category>
expense() {
  publish_event "{\"transactionEvent\":\"EXPENSE\",\"cashAmount\":$1,\"description\":\"$4\",\"billNumber\":\"$3\",\"billDate\":\"$(days_ago "$2")\",\"expenseCategory\":\"$5\"}"
  info "$3 ($5)"
}

# Portable "N days before today" -> YYYY-MM-DD (BSD date on macOS, GNU date on Linux).
days_ago() {
  if date -v-1d >/dev/null 2>&1; then
    date -v-"$1"d +%F
  else
    date -d "-$1 days" +%F
  fi
}

# ---------------------------------------------------------------------------
# preflight
# ---------------------------------------------------------------------------
command -v curl >/dev/null 2>&1 || die "curl is not installed."
command -v jq   >/dev/null 2>&1 || die "jq is not installed (brew install jq / apt install jq)."

say "Checking server at $BASE_URL"
curl -sS -m 5 -o /dev/null "$BASE_URL/api/parties" -u "preflight:preflight" \
  || die "Cannot reach $BASE_URL. Is the backend running?"
info "Server reachable."

# ---------------------------------------------------------------------------
# 1. User (ok if it already exists -- we just fall through to auth)
# ---------------------------------------------------------------------------
say "Signing up $EMAIL"

signup_resp=$(curl -sS -w $'\n%{http_code}' -X POST "$BASE_URL/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Test User\",\"contactNumber\":\"$CONTACT_NUMBER\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
signup_code=$(printf '%s' "$signup_resp" | tail -n1)
signup_body=$(printf '%s' "$signup_resp" | sed '$d')

if [ "$signup_code" = "200" ]; then
  info "Created $EMAIL"
else
  info "Signup skipped (HTTP $signup_code) -- assuming $EMAIL already exists."
fi

stores_resp=$(req GET /api/stores)
stores_code=$(code_of "$stores_resp"); stores_body=$(body_of "$stores_resp")
[ "$stores_code" = "200" ] || die "Could not authenticate as $EMAIL:$PASSWORD. Signup said: $signup_body"
info "Authenticated as $EMAIL."

# ---------------------------------------------------------------------------
# 2. Store (create one if this account has none yet)
# ---------------------------------------------------------------------------
say "Ensuring a store exists"

store_count=$(printf '%s' "$stores_body" | jq 'length')
if [ "$store_count" = "0" ]; then
  create_resp=$(req POST /api/stores '{"name":"Test Store","address":"Main Bazaar, Lahore","contact":"0421234567"}')
  info "Created store -> $(body_of "$create_resp" | jq -r '.id')"
else
  info "Using existing store -> $(printf '%s' "$stores_body" | jq -r '.[0].id') ($(printf '%s' "$stores_body" | jq -r '.[0].name'))"
fi

# ---------------------------------------------------------------------------
# 3. Parties (get-or-create by name, so re-runs don't duplicate master data)
# ---------------------------------------------------------------------------
say "Ensuring parties exist"

parties_resp=$(req GET /api/parties)
PARTIES_JSON=$(body_of "$parties_resp")

get_or_create_party() { # <name> <contact>
  local name="$1" contact="$2" id resp
  # GET /api/parties returns partyId; POST /api/parties returns a Party with id — accept either.
  id=$(printf '%s' "$PARTIES_JSON" | jq -r --arg n "$name" '[.[] | select(.name==$n)][0] | (.partyId // .id) // empty')
  if [ -n "$id" ]; then
    printf '%s' "$id"
    return
  fi
  # Two steps on purpose: bash 3.2 (macOS's /bin/bash) mis-parses escaped
  # quotes when a $(...) with them is nested inside another $(...).
  resp=$(req POST /api/parties "{\"name\":\"$name\",\"contact\":\"$contact\",\"address\":\"\"}")
  body_of "$resp" | jq -r '.id'
}

PARTY_BILAL=$(get_or_create_party "Bilal Traders" "03111111111")
PARTY_USMAN=$(get_or_create_party "Usman Wholesale" "03122222222")
PARTY_KAMRAN=$(get_or_create_party "Kamran Retail" "03133333333")
PARTY_FAISAL=$(get_or_create_party "Faisal Distributors" "03144444444")
PARTY_ADEEL=$(get_or_create_party "Adeel General Store" "03155555555")
PARTY_SAJID=$(get_or_create_party "Sajid Karyana" "03166666666")
PARTY_NOMAN=$(get_or_create_party "Noman Suppliers" "03177777777")
info "Bilal Traders -> $PARTY_BILAL"
info "Usman Wholesale -> $PARTY_USMAN"
info "Kamran Retail -> $PARTY_KAMRAN"
info "Faisal Distributors -> $PARTY_FAISAL"
info "Adeel General Store -> $PARTY_ADEEL"
info "Sajid Karyana -> $PARTY_SAJID"
info "Noman Suppliers -> $PARTY_NOMAN"

# ---------------------------------------------------------------------------
# 4. Store items (get-or-create by name; 20 kiryana items).
#    salePrice != costPrice on purpose -- SALE prefills a line's rate from
#    salePrice, PURCHASE from costPrice, so they must differ to tell apart.
# ---------------------------------------------------------------------------
say "Ensuring store items exist"

items_resp=$(req GET /api/store-items)
ITEMS_JSON=$(body_of "$items_resp")

get_or_create_item() { # <name> <unit> <salePrice> <costPrice>
  local name="$1" unit="$2" sale="$3" cost="$4" id resp
  id=$(printf '%s' "$ITEMS_JSON" | jq -r --arg n "$name" '[.[] | select(.name==$n)][0].id // empty')
  if [ -n "$id" ]; then
    printf '%s' "$id"
    return
  fi
  resp=$(req POST /api/store-items "{\"name\":\"$name\",\"unit\":\"$unit\",\"salePrice\":$sale,\"costPrice\":$cost}")
  body_of "$resp" | jq -r '.id'
}

ITEM_SUGAR=$(get_or_create_item    "Sugar"            "kg"     120 100)
ITEM_FLOUR=$(get_or_create_item    "Flour"            "kg"     90  75)
ITEM_RICE=$(get_or_create_item     "Rice"             "kg"     200 170)
ITEM_OIL=$(get_or_create_item      "Cooking Oil"      "litre"  550 500)
ITEM_TEA=$(get_or_create_item      "Tea"              "packet" 400 350)
ITEM_SALT=$(get_or_create_item     "Salt"             "kg"     40  30)
ITEM_DAAL_CHANA=$(get_or_create_item "Daal Chana"     "kg"     180 150)
ITEM_DAAL_MASOOR=$(get_or_create_item "Daal Masoor"   "kg"     220 190)
ITEM_CHILI=$(get_or_create_item    "Red Chili Powder" "kg"     600 520)
ITEM_TURMERIC=$(get_or_create_item "Turmeric Powder"  "kg"     450 380)
ITEM_BASMATI=$(get_or_create_item  "Basmati Rice"     "kg"     350 300)
ITEM_VERMICELLI=$(get_or_create_item "Vermicelli"     "packet" 90  70)
ITEM_MILK_POWDER=$(get_or_create_item "Milk Powder"   "kg"     950 850)
ITEM_BUTTER=$(get_or_create_item   "Butter"           "kg"     850 750)
ITEM_GHEE=$(get_or_create_item     "Ghee"             "kg"     700 620)
ITEM_SOAP=$(get_or_create_item     "Soap"             "piece"  60  45)
ITEM_DETERGENT=$(get_or_create_item "Detergent Powder" "kg"    250 210)
ITEM_MATCHBOX=$(get_or_create_item "Matchbox"         "packet" 10  6)
ITEM_BISCUITS=$(get_or_create_item "Biscuits"         "packet" 80  60)
ITEM_ROCK_SALT=$(get_or_create_item "Rock Salt"       "kg"     150 120)
info "20 items ready (Sugar, Flour, Rice, Cooking Oil, Tea, Salt, Daal Chana, Daal Masoor,"
info "Red Chili Powder, Turmeric Powder, Basmati Rice, Vermicelli, Milk Powder, Butter,"
info "Ghee, Soap, Detergent Powder, Matchbox, Biscuits, Rock Salt)"


# ---------------------------------------------------------------------------
# 5. Entries -- 46 events over the last 30 days: SALE / PURCHASE / RECEIPT /
#    PAYMENT / EXPENSE, single- and multi-line, fully / partially / over-paid,
#    expenses tagged by category. Adeel's oldest unpaid bills (SALE-003, SALE-005)
#    are cleared oldest-first by one 12,000 receipt (RCPT-002) to exercise the
#    party-report FIFO "Paid" marking. Extend with the txn/settle/expense helpers.
# ---------------------------------------------------------------------------
say "Publishing entries"

# ---- ~4 weeks ago ----
txn SALE 3300 3300 30 SALE-001 "Sugar and flour sale to Bilal Traders" "$PARTY_BILAL" "Bilal Traders" \
  "$(line "$ITEM_SUGAR" "Sugar" 20 120),$(line "$ITEM_FLOUR" "Flour" 10 90)"
txn PURCHASE 15000 24500 29 PUR-001 "Rice and daal chana from Usman Wholesale" "$PARTY_USMAN" "Usman Wholesale" \
  "$(line "$ITEM_RICE" "Rice" 100 170),$(line "$ITEM_DAAL_CHANA" "Daal Chana" 50 150)"
txn SALE 3000 3950 28 SALE-002 "Cooking oil and tea to Kamran Retail" "$PARTY_KAMRAN" "Kamran Retail" \
  "$(line "$ITEM_OIL" "Cooking Oil" 5 550),$(line "$ITEM_TEA" "Tea" 3 400)"
expense 300 28 EXP-008 "Chai and refreshments for staff" "Tea/Refreshments"
txn SALE 0 6050 27 SALE-003 "Basmati and biscuits to Adeel General Store" "$PARTY_ADEEL" "Adeel General Store" \
  "$(line "$ITEM_BASMATI" "Basmati Rice" 15 350),$(line "$ITEM_BISCUITS" "Biscuits" 10 80)"
expense 1500 26 EXP-001 "Shop electricity bill" "ELECTRICITY"
txn SALE 1850 1850 26 SALE-017 "Detergent and soap to Sajid Karyana" "$PARTY_SAJID" "Sajid Karyana" \
  "$(line "$ITEM_DETERGENT" "Detergent Powder" 5 250),$(line "$ITEM_SOAP" "Soap" 10 60)"
txn PURCHASE 12400 12400 25 PUR-002 "Ghee from Faisal Distributors" "$PARTY_FAISAL" "Faisal Distributors" \
  "$(line "$ITEM_GHEE" "Ghee" 20 620)"
txn SALE 4000 7300 24 SALE-004 "Milk powder and butter to Sajid Karyana" "$PARTY_SAJID" "Sajid Karyana" \
  "$(line "$ITEM_MILK_POWDER" "Milk Powder" 5 950),$(line "$ITEM_BUTTER" "Butter" 3 850)"

# ---- ~3 weeks ago ----
txn SALE 0 5200 23 SALE-005 "Sugar and rice to Adeel General Store" "$PARTY_ADEEL" "Adeel General Store" \
  "$(line "$ITEM_SUGAR" "Sugar" 10 120),$(line "$ITEM_RICE" "Rice" 20 200)"
expense 15000 22 EXP-002 "Monthly shop rent" "Rent"
txn PURCHASE 20000 21800 21 PUR-003 "Turmeric and chili from Faisal Distributors" "$PARTY_FAISAL" "Faisal Distributors" \
  "$(line "$ITEM_TURMERIC" "Turmeric Powder" 30 380),$(line "$ITEM_CHILI" "Red Chili Powder" 20 520)"
txn SALE 3700 3700 20 SALE-006 "Detergent and soap to Kamran Retail" "$PARTY_KAMRAN" "Kamran Retail" \
  "$(line "$ITEM_DETERGENT" "Detergent Powder" 10 250),$(line "$ITEM_SOAP" "Soap" 20 60)"
txn PURCHASE 3000 6200 20 PUR-007 "Ghee from Faisal Distributors" "$PARTY_FAISAL" "Faisal Distributors" \
  "$(line "$ITEM_GHEE" "Ghee" 10 620)"
txn SALE 2000 5500 19 SALE-007 "Cooking oil to Bilal Traders" "$PARTY_BILAL" "Bilal Traders" \
  "$(line "$ITEM_OIL" "Cooking Oil" 10 550)"
settle RECEIPT 950 18 RCPT-001 "Balance received from Kamran Retail" "$PARTY_KAMRAN" "Kamran Retail"
expense 25000 17 EXP-003 "Staff salaries" "SALARIES"

# ---- ~2 weeks ago ----
txn PURCHASE 3400 3400 16 PUR-004 "Vermicelli and matchbox from Usman Wholesale" "$PARTY_USMAN" "Usman Wholesale" \
  "$(line "$ITEM_VERMICELLI" "Vermicelli" 40 70),$(line "$ITEM_MATCHBOX" "Matchbox" 100 6)"
txn SALE 5000 6000 16 SALE-018 "Rice to Kamran Retail" "$PARTY_KAMRAN" "Kamran Retail" \
  "$(line "$ITEM_RICE" "Rice" 30 200)"
txn SALE 0 4000 15 SALE-008 "Tea to Adeel General Store" "$PARTY_ADEEL" "Adeel General Store" \
  "$(line "$ITEM_TEA" "Tea" 10 400)"
settle PAYMENT 5000 14 PAY-001 "Part payment to Usman Wholesale" "$PARTY_USMAN" "Usman Wholesale"
txn SALE 3900 3900 13 SALE-009 "Ghee and salt to Sajid Karyana" "$PARTY_SAJID" "Sajid Karyana" \
  "$(line "$ITEM_GHEE" "Ghee" 5 700),$(line "$ITEM_SALT" "Salt" 10 40)"
expense 800 12 EXP-004 "Transport and delivery charges" "Transport"
expense 5000 12 EXP-009 "Salary advance to helper" "SALARIES"
txn SALE 1700 1700 11 SALE-010 "Salt to Bilal Traders" "$PARTY_BILAL" "Bilal Traders" \
  "$(line "$ITEM_ROCK_SALT" "Rock Salt" 10 150),$(line "$ITEM_SALT" "Salt" 5 40)"

# ---- FIFO demo: Adeel owes 6050 + 5200 + 4000 = 15250; this 12,000 clears the
#      two oldest bills in full (SALE-003, SALE-005) and part of SALE-008. ----
settle RECEIPT 12000 10 RCPT-002 "Lump payment from Adeel General Store" "$PARTY_ADEEL" "Adeel General Store"

# ---- last week ----
txn PURCHASE 6000 12700 9 PUR-005 "Milk powder and detergent from Noman Suppliers" "$PARTY_NOMAN" "Noman Suppliers" \
  "$(line "$ITEM_MILK_POWDER" "Milk Powder" 10 850),$(line "$ITEM_DETERGENT" "Detergent Powder" 20 210)"
txn SALE 2700 2700 9 SALE-019 "Flour to Bilal Traders" "$PARTY_BILAL" "Bilal Traders" \
  "$(line "$ITEM_FLOUR" "Flour" 30 90)"
txn SALE 4000 3600 8 SALE-011 "Sugar and flour to Kamran Retail (overpaid)" "$PARTY_KAMRAN" "Kamran Retail" \
  "$(line "$ITEM_SUGAR" "Sugar" 15 120),$(line "$ITEM_FLOUR" "Flour" 20 90)"
expense 3500 7 EXP-005 "Weighing scale repair and spares" "PARTS"
txn SALE 2000 4700 6 SALE-012 "Basmati and biscuits to Sajid Karyana" "$PARTY_SAJID" "Sajid Karyana" \
  "$(line "$ITEM_BASMATI" "Basmati Rice" 10 350),$(line "$ITEM_BISCUITS" "Biscuits" 15 80)"
settle RECEIPT 1000 6 RCPT-005 "Balance received from Kamran Retail" "$PARTY_KAMRAN" "Kamran Retail"
settle PAYMENT 1800 5 PAY-002 "Final payment to Faisal Distributors" "$PARTY_FAISAL" "Faisal Distributors"

# ---- this week ----
txn SALE 4250 4250 4 SALE-013 "Butter to Bilal Traders" "$PARTY_BILAL" "Bilal Traders" \
  "$(line "$ITEM_BUTTER" "Butter" 5 850)"
txn PURCHASE 7500 7500 4 PUR-008 "Butter from Noman Suppliers" "$PARTY_NOMAN" "Noman Suppliers" \
  "$(line "$ITEM_BUTTER" "Butter" 10 750)"
settle RECEIPT 3500 3 RCPT-003 "Balance received from Bilal Traders" "$PARTY_BILAL" "Bilal Traders"
expense 1200 3 EXP-006 "Sundry shop supplies" "GENERAL"
txn PURCHASE 8500 8500 2 PUR-006 "Rice from Usman Wholesale" "$PARTY_USMAN" "Usman Wholesale" \
  "$(line "$ITEM_RICE" "Rice" 50 170)"
txn SALE 0 4850 2 SALE-014 "Oil and ghee to Adeel General Store" "$PARTY_ADEEL" "Adeel General Store" \
  "$(line "$ITEM_OIL" "Cooking Oil" 5 550),$(line "$ITEM_GHEE" "Ghee" 3 700)"
expense 950 2 EXP-010 "Rickshaw delivery charges" "Transport"
settle RECEIPT 3300 1 RCPT-004 "Balance received from Sajid Karyana" "$PARTY_SAJID" "Sajid Karyana"
txn SALE 3900 3900 1 SALE-015 "Milk powder and tea to Kamran Retail" "$PARTY_KAMRAN" "Kamran Retail" \
  "$(line "$ITEM_MILK_POWDER" "Milk Powder" 2 950),$(line "$ITEM_TEA" "Tea" 5 400)"
settle PAYMENT 4500 1 PAY-003 "Settling balance to Usman Wholesale" "$PARTY_USMAN" "Usman Wholesale"

# ---- today ----
expense 600 0 EXP-007 "Shopping bags and packaging" "Packaging"
txn SALE 1000 3000 0 SALE-016 "Sugar to Bilal Traders" "$PARTY_BILAL" "Bilal Traders" \
  "$(line "$ITEM_SUGAR" "Sugar" 25 120)"
txn SALE 600 600 0 SALE-020 "Sugar to Adeel General Store" "$PARTY_ADEEL" "Adeel General Store" \
  "$(line "$ITEM_SUGAR" "Sugar" 5 120)"

say "Done. Log in as $EMAIL / $PASSWORD -- 7 parties, 20 items, 46 entries loaded."
