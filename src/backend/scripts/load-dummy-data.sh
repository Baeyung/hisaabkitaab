#!/usr/bin/env bash
#
# Seeds dummy data into HisaabKitaab through the REST API for a single, fixed
# test account that owns THREE stores, each with its own trade, catalog, khata
# and history -- so the store switcher, per-store isolation and the empty-ish
# store case all have something real to show.
#
#   1. Kiryana Store   grocery: 7 parties, 20 items, ~46 entries over 30 days,
#                      incl. the FIFO receipt demo. The big dataset.
#   2. Kapra Ghar      cloth shop: 4 parties, 5 items (unit "gz"), ~13 entries,
#                      credit + cash purchases for the PURCHASE screen.
#   3. Hardware Point  thin store: 2 parties, 4 items, 6 entries, opening
#                      balances/stock/cash set -- what a freshly onboarded
#                      shop looks like.
#
# Every store-scoped call goes to /api/stores/{storeId}/... -- the store comes
# from the URL, never from the login, so seeding a second store is just a second
# `use_store` call. Re-run any time: stores, parties and items are matched by
# name and only created if missing, so a re-run just stacks more transactions on
# top of the same master data.
#
# Requirements: bash + curl + jq. On Windows run load-dummy-data.bat, which
# hands this file to WSL/Git Bash.
#
# Usage:
#   ./load-dummy-data.sh
#   BASE_URL=http://localhost:8080 EMAIL=you@example.com PASSWORD=secret ./load-dummy-data.sh
#
set -euo pipefail

# --- account to seed --------------------------------------------------------
# Put your own login here to seed the account you actually use; leave it alone
# for the fixed test account. Env vars win over these, so a one-off run needs no
# edit. The account is signed up if new, reused if it already exists -- but a
# wrong password counts as a failed login, and 4 of those lock the account.
EMAIL="${EMAIL:-test@test.com}"
PASSWORD="${PASSWORD:-test}"
# ----------------------------------------------------------------------------

BASE_URL="${BASE_URL:-http://localhost:8080}"
CONTACT_NUMBER="${CONTACT_NUMBER:-03000000000}"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
info() { printf '    \033[0;90m%s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# GET/POST/PUT as $EMAIL:$PASSWORD. args: <method> <path> [json_body]
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

# Same as req, but under the store currently selected by use_store.
sreq() { req "$1" "/api/stores/$STORE$2" "${3:-}"; }

publish_event() { # <json>
  local resp code body
  resp=$(sreq POST /event "$1")
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

# Cash SALE/PURCHASE with no party -- the counter sale that never hits a khata. args:
#   <event> <cash> <billAmount> <days_ago> <billNo> <desc> <itemsJson>
counter_txn() {
  publish_event "{\"transactionEvent\":\"$1\",\"cashAmount\":$2,\"billAmount\":$3,\"description\":\"$6\",\"billNumber\":\"$5\",\"billDate\":\"$(days_ago "$4")\",\"party\":null,\"items\":[$7]}"
  info "$5 (cash counter)"
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

# Onboarding openings -- set, not added, so re-runs leave them where they are.
open_cash()    { sreq PUT /opening-cash "{\"amount\":$1}" >/dev/null; }                                  # <amount>
open_balance() { sreq PUT "/parties/$1/opening-balance" "{\"amount\":$2,\"direction\":\"$3\"}" >/dev/null; } # <partyId> <amount> THEY_OWE_YOU|YOU_OWE_THEM
open_stock()   { sreq PUT "/store-items/$1/opening-stock" "{\"quantity\":$2}" >/dev/null; }              # <itemId> <qty>

# Portable "N days before today" -> YYYY-MM-DD (BSD date on macOS, GNU date on Linux).
days_ago() {
  if date -v-1d >/dev/null 2>&1; then
    date -v-"$1"d +%F
  else
    date -d "-$1 days" +%F
  fi
}

# ---------------------------------------------------------------------------
# store selection + per-store master data
# ---------------------------------------------------------------------------
# Everything below the helpers reads these three globals: STORE is the store id
# in the URL, and the two caches let get_or_create_* match by name with one GET
# per store instead of one per lookup.
STORE=""
PARTIES_JSON="[]"
ITEMS_JSON="[]"

use_store() { # <name> <address> <contact> -- get-or-create, then point the helpers at it
  local name="$1" address="$2" contact="$3" id resp
  id=$(printf '%s' "$STORES_JSON" | jq -r --arg n "$name" '[.[] | select(.name==$n)][0].id // empty')
  if [ -n "$id" ]; then
    info "using existing store"
  else
    # Two steps on purpose: bash 3.2 (macOS's /bin/bash) mis-parses escaped
    # quotes when a $(...) with them is nested inside another $(...).
    resp=$(req POST /api/stores "{\"name\":\"$name\",\"address\":\"$address\",\"contact\":\"$contact\"}")
    [ "$(code_of "$resp")" = "200" ] || die "could not create store $name: $(body_of "$resp")"
    id=$(body_of "$resp" | jq -r '.id')
  fi
  STORE="$id"
  PARTIES_JSON=$(body_of "$(sreq GET /parties)")
  ITEMS_JSON=$(body_of "$(sreq GET /store-items)")
  info "$name -> $STORE"
}

get_or_create_party() { # <name> <contact>
  local name="$1" contact="$2" id resp
  # GET /parties returns partyId; POST /parties returns a Party with id — accept either.
  id=$(printf '%s' "$PARTIES_JSON" | jq -r --arg n "$name" '[.[] | select(.name==$n)][0] | (.partyId // .id) // empty')
  if [ -n "$id" ]; then
    printf '%s' "$id"
    return
  fi
  resp=$(sreq POST /parties "{\"name\":\"$name\",\"contact\":\"$contact\",\"address\":\"\"}")
  body_of "$resp" | jq -r '.id'
}

# salePrice != costPrice on purpose -- SALE prefills a line's rate from salePrice,
# PURCHASE from costPrice, so they must differ to tell the two screens apart.
get_or_create_item() { # <name> <unit> <salePrice> <costPrice>
  local name="$1" unit="$2" sale="$3" cost="$4" id resp
  id=$(printf '%s' "$ITEMS_JSON" | jq -r --arg n "$name" '[.[] | select(.name==$n)][0].id // empty')
  if [ -n "$id" ]; then
    printf '%s' "$id"
    return
  fi
  resp=$(sreq POST /store-items "{\"name\":\"$name\",\"unit\":\"$unit\",\"salePrice\":$sale,\"costPrice\":$cost}")
  body_of "$resp" | jq -r '.id'
}

# ---------------------------------------------------------------------------
# preflight
# ---------------------------------------------------------------------------
command -v curl >/dev/null 2>&1 || die "curl is not installed."
command -v jq   >/dev/null 2>&1 || die "jq is not installed (brew install jq / apt install jq)."

say "Checking server at $BASE_URL"
curl -sS -m 5 -o /dev/null "$BASE_URL/api/stores" -u "preflight:preflight" \
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
[ "$(code_of "$stores_resp")" = "200" ] \
  || die "Could not authenticate as $EMAIL:$PASSWORD. Signup said: $signup_body"
STORES_JSON=$(body_of "$stores_resp")
info "Authenticated as $EMAIL ($(printf '%s' "$STORES_JSON" | jq 'length') store(s) already)."

# ===========================================================================
# STORE 1 -- Kiryana Store: the full dataset
# ===========================================================================
say "Store 1: Kiryana Store"
use_store "Kiryana Store" "Main Bazaar, Gulberg, Lahore" "0421234567"

PARTY_BILAL=$(get_or_create_party "Bilal Traders" "03111111111")
PARTY_USMAN=$(get_or_create_party "Usman Wholesale" "03122222222")
PARTY_KAMRAN=$(get_or_create_party "Kamran Retail" "03133333333")
PARTY_FAISAL=$(get_or_create_party "Faisal Distributors" "03144444444")
PARTY_ADEEL=$(get_or_create_party "Adeel General Store" "03155555555")
PARTY_SAJID=$(get_or_create_party "Sajid Karyana" "03166666666")
PARTY_NOMAN=$(get_or_create_party "Noman Suppliers" "03177777777")
info "7 parties ready."

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
info "20 items ready."

open_cash 30000
info "Opening cash 30,000."

# ---- Entries: 46 events over the last 30 days: SALE / PURCHASE / RECEIPT /
#      PAYMENT / EXPENSE, single- and multi-line, fully / partially / over-paid,
#      expenses tagged by category. Adeel's oldest unpaid bills (SALE-003,
#      SALE-005) are cleared oldest-first by one 12,000 receipt (RCPT-002) to
#      exercise the party-report FIFO "Paid" marking.
say "Kiryana Store: publishing entries"

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

# ===========================================================================
# STORE 2 -- Kapra Ghar: cloth shop, purchase-heavy, unit "gz" (gaz/yards)
# ===========================================================================
say "Store 2: Kapra Ghar"
use_store "Kapra Ghar" "Azam Cloth Market, Lahore" "0429876543"

P2_CRESCENT=$(get_or_create_party "Crescent Mills" "03121110000")
P2_CHENAB=$(get_or_create_party   "Chenab Textiles" "03121110001")
P2_ZAINAB=$(get_or_create_party   "Zainab Boutique" "03121110002")
P2_MALIK=$(get_or_create_party    "Malik Cloth House" "03121110003")
info "4 parties ready."

I2_CHAMKI=$(get_or_create_item  "Chamki-101"  "gz" 450 320)
I2_LAWN=$(get_or_create_item    "Lawn-202"    "gz" 300 210)
I2_SILK=$(get_or_create_item    "Silk-303"    "gz" 900 640)
I2_KHADDAR=$(get_or_create_item "Khaddar-404" "gz" 380 260)
I2_LINEN=$(get_or_create_item   "Linen-505"   "gz" 520 400)
info "5 items ready."

open_cash 12000
open_stock "$I2_KHADDAR" 200
open_stock "$I2_LINEN" 120
open_balance "$P2_CRESCENT" 18000 YOU_OWE_THEM
open_balance "$P2_MALIK" 7500 THEY_OWE_YOU
info "Opening cash 12,000; khaddar/linen stock and two carried-in balances set."

say "Kapra Ghar: publishing entries"

txn PURCHASE 20000 32000 21 KG-PUR-001 "Chamki stock from Crescent Mills (part payment)" "$P2_CRESCENT" "Crescent Mills" \
  "$(line "$I2_CHAMKI" "Chamki-101" 100 320)"
counter_txn PURCHASE 10500 10500 20 KG-PUR-002 "Lawn stock, cash purchase" \
  "$(line "$I2_LAWN" "Lawn-202" 50 210)"
txn PURCHASE 0 32000 17 KG-PUR-003 "Silk from Chenab Textiles, full credit" "$P2_CHENAB" "Chenab Textiles" \
  "$(line "$I2_SILK" "Silk-303" 50 640)"
txn SALE 13500 13500 15 KG-SALE-001 "Chamki to Zainab Boutique" "$P2_ZAINAB" "Zainab Boutique" \
  "$(line "$I2_CHAMKI" "Chamki-101" 30 450)"
expense 9000 14 KG-EXP-001 "Shop rent" "Rent"
txn SALE 5000 22500 12 KG-SALE-002 "Silk suits to Malik Cloth House" "$P2_MALIK" "Malik Cloth House" \
  "$(line "$I2_SILK" "Silk-303" 25 900)"
settle PAYMENT 12000 10 KG-PAY-001 "Part payment to Crescent Mills" "$P2_CRESCENT" "Crescent Mills"
txn SALE 7600 7600 8 KG-SALE-003 "Khaddar and lawn to Zainab Boutique" "$P2_ZAINAB" "Zainab Boutique" \
  "$(line "$I2_KHADDAR" "Khaddar-404" 10 380),$(line "$I2_LAWN" "Lawn-202" 12 300)"
expense 2200 7 KG-EXP-002 "Tailoring and cutting charges" "GENERAL"
settle RECEIPT 10000 5 KG-RCPT-001 "Balance received from Malik Cloth House" "$P2_MALIK" "Malik Cloth House"
counter_txn SALE 5200 5200 3 KG-SALE-004 "Linen, walk-in customer" \
  "$(line "$I2_LINEN" "Linen-505" 10 520)"
expense 1800 2 KG-EXP-003 "Electricity bill" "ELECTRICITY"
txn SALE 0 9000 0 KG-SALE-005 "Silk on credit to Zainab Boutique" "$P2_ZAINAB" "Zainab Boutique" \
  "$(line "$I2_SILK" "Silk-303" 10 900)"

# ===========================================================================
# STORE 3 -- Hardware Point: a thin, freshly-onboarded shop
# ===========================================================================
say "Store 3: Hardware Point"
use_store "Hardware Point" "Ferozepur Road, Lahore" "0423334444"

P3_STEEL=$(get_or_create_party "Ittefaq Steel" "03211110000")
P3_RAZA=$(get_or_create_party  "Raza Builders" "03211110001")
info "2 parties ready."

I3_CEMENT=$(get_or_create_item "Cement Bag"  "bag"   1350 1180)
I3_NAILS=$(get_or_create_item  "Nails 3in"   "kg"    260  190)
I3_PIPE=$(get_or_create_item   "PVC Pipe 1in" "piece" 480  360)
I3_PAINT=$(get_or_create_item  "Wall Paint"  "litre" 900  700)
info "4 items ready."

open_cash 5000
open_stock "$I3_CEMENT" 40
open_stock "$I3_NAILS" 25
open_balance "$P3_RAZA" 4000 THEY_OWE_YOU
info "Opening cash 5,000; cement/nails stock and Raza's carried-in balance set."

say "Hardware Point: publishing entries"

txn PURCHASE 30000 47200 9 HW-PUR-001 "Cement from Ittefaq Steel" "$P3_STEEL" "Ittefaq Steel" \
  "$(line "$I3_CEMENT" "Cement Bag" 40 1180)"
txn SALE 0 13500 6 HW-SALE-001 "Cement to Raza Builders, on account" "$P3_RAZA" "Raza Builders" \
  "$(line "$I3_CEMENT" "Cement Bag" 10 1350)"
counter_txn SALE 4400 4400 4 HW-SALE-002 "Pipes and nails, cash counter" \
  "$(line "$I3_PIPE" "PVC Pipe 1in" 5 480),$(line "$I3_NAILS" "Nails 3in" 8 260)"
expense 1100 3 HW-EXP-001 "Shop electricity bill" "ELECTRICITY"
settle RECEIPT 8000 2 HW-RCPT-001 "Part payment from Raza Builders" "$P3_RAZA" "Raza Builders"
txn SALE 1800 1800 0 HW-SALE-003 "Wall paint to Raza Builders" "$P3_RAZA" "Raza Builders" \
  "$(line "$I3_PAINT" "Wall Paint" 2 900)"

say "Done. Log in as $EMAIL / $PASSWORD -- 3 stores loaded (Kiryana Store, Kapra Ghar, Hardware Point)."
