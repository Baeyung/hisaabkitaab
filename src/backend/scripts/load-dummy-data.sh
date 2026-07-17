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
#   3. Ensure 4 parties exist   POST /api/parties          (basic auth)
#   4. Ensure 20 items exist    POST /api/store-items      (basic auth)
#   5. Publish ~17 entries      POST /api/event            (basic auth) across
#      SALE, PURCHASE, RECEIPT, PAYMENT and EXPENSE, several with multi-line items.
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
  id=$(printf '%s' "$PARTIES_JSON" | jq -r --arg n "$name" '[.[] | select(.name==$n)][0].id // empty')
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
info "Bilal Traders -> $PARTY_BILAL"
info "Usman Wholesale -> $PARTY_USMAN"
info "Kamran Retail -> $PARTY_KAMRAN"
info "Faisal Distributors -> $PARTY_FAISAL"

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
# 5. Entries -- every supported TransactionEvent, several multi-item lines,
#    a mix of fully paid / partially paid / overpaid bills, spread over the
#    last two weeks so cashbook/ledger date filters have something to show.
# ---------------------------------------------------------------------------
say "Publishing entries"

# SALE: Sugar 20kg + Flour 10kg, bill 3300, paid in full.
publish_event "{
  \"transactionEvent\":\"SALE\",\"cashAmount\":3300,\"billAmount\":3300,
  \"description\":\"Sugar and flour sale to Bilal Traders\",
  \"billNumber\":\"SALE-001\",\"billDate\":\"$(days_ago 13)\",
  \"party\":{\"partyId\":\"$PARTY_BILAL\",\"name\":\"Bilal Traders\"},
  \"items\":[
    {\"itemId\":\"$ITEM_SUGAR\",\"name\":\"Sugar\",\"quantity\":20,\"itemSoldAt\":120},
    {\"itemId\":\"$ITEM_FLOUR\",\"name\":\"Flour\",\"quantity\":10,\"itemSoldAt\":90}
  ]
}"
info "SALE-001 ok (Bilal Traders, paid in full)"

# PURCHASE: Rice 100kg + Daal Chana 50kg, bill 24500, paid 15000 -> owe 9500.
publish_event "{
  \"transactionEvent\":\"PURCHASE\",\"cashAmount\":15000,\"billAmount\":24500,
  \"description\":\"Rice and daal chana purchase from Usman Wholesale\",
  \"billNumber\":\"PUR-001\",\"billDate\":\"$(days_ago 12)\",
  \"party\":{\"partyId\":\"$PARTY_USMAN\",\"name\":\"Usman Wholesale\"},
  \"items\":[
    {\"itemId\":\"$ITEM_RICE\",\"name\":\"Rice\",\"quantity\":100,\"itemSoldAt\":170},
    {\"itemId\":\"$ITEM_DAAL_CHANA\",\"name\":\"Daal Chana\",\"quantity\":50,\"itemSoldAt\":150}
  ]
}"
info "PUR-001 ok (Usman Wholesale, owe 9,500)"

# SALE: Cooking Oil 5L + Tea 3 packets, bill 3950, paid 3000 -> owed 950.
publish_event "{
  \"transactionEvent\":\"SALE\",\"cashAmount\":3000,\"billAmount\":3950,
  \"description\":\"Cooking oil and tea sale to Kamran Retail\",
  \"billNumber\":\"SALE-002\",\"billDate\":\"$(days_ago 11)\",
  \"party\":{\"partyId\":\"$PARTY_KAMRAN\",\"name\":\"Kamran Retail\"},
  \"items\":[
    {\"itemId\":\"$ITEM_OIL\",\"name\":\"Cooking Oil\",\"quantity\":5,\"itemSoldAt\":550},
    {\"itemId\":\"$ITEM_TEA\",\"name\":\"Tea\",\"quantity\":3,\"itemSoldAt\":400}
  ]
}"
info "SALE-002 ok (Kamran Retail, owed 950)"

# PURCHASE: Ghee 20kg, bill 12400, paid in full.
publish_event "{
  \"transactionEvent\":\"PURCHASE\",\"cashAmount\":12400,\"billAmount\":12400,
  \"description\":\"Ghee purchase from Faisal Distributors\",
  \"billNumber\":\"PUR-002\",\"billDate\":\"$(days_ago 10)\",
  \"party\":{\"partyId\":\"$PARTY_FAISAL\",\"name\":\"Faisal Distributors\"},
  \"items\":[{\"itemId\":\"$ITEM_GHEE\",\"name\":\"Ghee\",\"quantity\":20,\"itemSoldAt\":620}]
}"
info "PUR-002 ok (Faisal Distributors, paid in full)"

# SALE: Basmati Rice 15kg + Biscuits 10 packets, bill 6050, paid 5000 -> owed 1050.
publish_event "{
  \"transactionEvent\":\"SALE\",\"cashAmount\":5000,\"billAmount\":6050,
  \"description\":\"Basmati rice and biscuits sale to Bilal Traders\",
  \"billNumber\":\"SALE-003\",\"billDate\":\"$(days_ago 9)\",
  \"party\":{\"partyId\":\"$PARTY_BILAL\",\"name\":\"Bilal Traders\"},
  \"items\":[
    {\"itemId\":\"$ITEM_BASMATI\",\"name\":\"Basmati Rice\",\"quantity\":15,\"itemSoldAt\":350},
    {\"itemId\":\"$ITEM_BISCUITS\",\"name\":\"Biscuits\",\"quantity\":10,\"itemSoldAt\":80}
  ]
}"
info "SALE-003 ok (Bilal Traders, owed 1,050)"

# SALE: Milk Powder 5kg + Butter 3kg, bill 7300, paid in full.
publish_event "{
  \"transactionEvent\":\"SALE\",\"cashAmount\":7300,\"billAmount\":7300,
  \"description\":\"Milk powder and butter sale to Kamran Retail\",
  \"billNumber\":\"SALE-004\",\"billDate\":\"$(days_ago 8)\",
  \"party\":{\"partyId\":\"$PARTY_KAMRAN\",\"name\":\"Kamran Retail\"},
  \"items\":[
    {\"itemId\":\"$ITEM_MILK_POWDER\",\"name\":\"Milk Powder\",\"quantity\":5,\"itemSoldAt\":950},
    {\"itemId\":\"$ITEM_BUTTER\",\"name\":\"Butter\",\"quantity\":3,\"itemSoldAt\":850}
  ]
}"
info "SALE-004 ok (Kamran Retail, paid in full)"

# PURCHASE: Turmeric 30kg + Red Chili 20kg, bill 21800, paid 20000 -> owe 1800.
publish_event "{
  \"transactionEvent\":\"PURCHASE\",\"cashAmount\":20000,\"billAmount\":21800,
  \"description\":\"Turmeric and chili powder purchase from Faisal Distributors\",
  \"billNumber\":\"PUR-003\",\"billDate\":\"$(days_ago 8)\",
  \"party\":{\"partyId\":\"$PARTY_FAISAL\",\"name\":\"Faisal Distributors\"},
  \"items\":[
    {\"itemId\":\"$ITEM_TURMERIC\",\"name\":\"Turmeric Powder\",\"quantity\":30,\"itemSoldAt\":380},
    {\"itemId\":\"$ITEM_CHILI\",\"name\":\"Red Chili Powder\",\"quantity\":20,\"itemSoldAt\":520}
  ]
}"
info "PUR-003 ok (Faisal Distributors, owe 1,800)"

# EXPENSE: shop electricity bill (cash out only, no party/item).
publish_event "{
  \"transactionEvent\":\"EXPENSE\",\"cashAmount\":1500,
  \"description\":\"Shop electricity bill\",
  \"billNumber\":\"EXP-001\",\"billDate\":\"$(days_ago 8)\"
}"
info "EXP-001 ok (electricity)"

# EXPENSE: monthly shop rent.
publish_event "{
  \"transactionEvent\":\"EXPENSE\",\"cashAmount\":15000,
  \"description\":\"Monthly shop rent\",
  \"billNumber\":\"EXP-002\",\"billDate\":\"$(days_ago 15)\"
}"
info "EXP-002 ok (rent)"

# PAYMENT: pay Usman Wholesale 5000 of the 9500 owed from PUR-001.
publish_event "{
  \"transactionEvent\":\"PAYMENT\",\"cashAmount\":5000,
  \"description\":\"Part payment to Usman Wholesale\",
  \"billNumber\":\"PAY-001\",\"billDate\":\"$(days_ago 6)\",
  \"party\":{\"partyId\":\"$PARTY_USMAN\",\"name\":\"Usman Wholesale\"}
}"
info "PAY-001 ok (Usman Wholesale, paid 5,000)"

# SALE: Detergent 10kg + Soap 20 pieces, bill 3700, customer paid 4200 (overpaid by 500).
publish_event "{
  \"transactionEvent\":\"SALE\",\"cashAmount\":4200,\"billAmount\":3700,
  \"description\":\"Detergent and soap sale to Kamran Retail\",
  \"billNumber\":\"SALE-005\",\"billDate\":\"$(days_ago 5)\",
  \"party\":{\"partyId\":\"$PARTY_KAMRAN\",\"name\":\"Kamran Retail\"},
  \"items\":[
    {\"itemId\":\"$ITEM_DETERGENT\",\"name\":\"Detergent Powder\",\"quantity\":10,\"itemSoldAt\":250},
    {\"itemId\":\"$ITEM_SOAP\",\"name\":\"Soap\",\"quantity\":20,\"itemSoldAt\":60}
  ]
}"
info "SALE-005 ok (Kamran Retail, overpaid by 500)"

# PAYMENT: pay Faisal Distributors the remaining 1800 owed from PUR-003.
publish_event "{
  \"transactionEvent\":\"PAYMENT\",\"cashAmount\":1800,
  \"description\":\"Final payment to Faisal Distributors\",
  \"billNumber\":\"PAY-002\",\"billDate\":\"$(days_ago 4)\",
  \"party\":{\"partyId\":\"$PARTY_FAISAL\",\"name\":\"Faisal Distributors\"}
}"
info "PAY-002 ok (Faisal Distributors, settled)"

# RECEIPT: collect the 1050 Bilal Traders owed from SALE-003.
publish_event "{
  \"transactionEvent\":\"RECEIPT\",\"cashAmount\":1050,
  \"description\":\"Balance received from Bilal Traders\",
  \"billNumber\":\"RCPT-001\",\"billDate\":\"$(days_ago 3)\",
  \"party\":{\"partyId\":\"$PARTY_BILAL\",\"name\":\"Bilal Traders\"}
}"
info "RCPT-001 ok (Bilal Traders, settled)"

# RECEIPT: collect the 950 Kamran Retail owed from SALE-002.
publish_event "{
  \"transactionEvent\":\"RECEIPT\",\"cashAmount\":950,
  \"description\":\"Balance received from Kamran Retail\",
  \"billNumber\":\"RCPT-002\",\"billDate\":\"$(days_ago 2)\",
  \"party\":{\"partyId\":\"$PARTY_KAMRAN\",\"name\":\"Kamran Retail\"}
}"
info "RCPT-002 ok (Kamran Retail, settled)"

# PURCHASE: Vermicelli 40 packets + Matchbox 100 packets, bill 3400, paid in full.
publish_event "{
  \"transactionEvent\":\"PURCHASE\",\"cashAmount\":3400,\"billAmount\":3400,
  \"description\":\"Vermicelli and matchbox purchase from Usman Wholesale\",
  \"billNumber\":\"PUR-004\",\"billDate\":\"$(days_ago 2)\",
  \"party\":{\"partyId\":\"$PARTY_USMAN\",\"name\":\"Usman Wholesale\"},
  \"items\":[
    {\"itemId\":\"$ITEM_VERMICELLI\",\"name\":\"Vermicelli\",\"quantity\":40,\"itemSoldAt\":70},
    {\"itemId\":\"$ITEM_MATCHBOX\",\"name\":\"Matchbox\",\"quantity\":100,\"itemSoldAt\":6}
  ]
}"
info "PUR-004 ok (Usman Wholesale, paid in full)"

# SALE: Salt 5kg + Rock Salt 10kg, bill 1700, paid in full.
publish_event "{
  \"transactionEvent\":\"SALE\",\"cashAmount\":1700,\"billAmount\":1700,
  \"description\":\"Salt sale to Bilal Traders\",
  \"billNumber\":\"SALE-006\",\"billDate\":\"$(days_ago 1)\",
  \"party\":{\"partyId\":\"$PARTY_BILAL\",\"name\":\"Bilal Traders\"},
  \"items\":[
    {\"itemId\":\"$ITEM_SALT\",\"name\":\"Salt\",\"quantity\":5,\"itemSoldAt\":40},
    {\"itemId\":\"$ITEM_ROCK_SALT\",\"name\":\"Rock Salt\",\"quantity\":10,\"itemSoldAt\":150}
  ]
}"
info "SALE-006 ok (Bilal Traders, paid in full)"

# EXPENSE: delivery/transport charges.
publish_event "{
  \"transactionEvent\":\"EXPENSE\",\"cashAmount\":800,
  \"description\":\"Transport and delivery charges\",
  \"billNumber\":\"EXP-003\",\"billDate\":\"$(days_ago 1)\"
}"
info "EXP-003 ok (transport)"

say "Done. Log in as $EMAIL / $PASSWORD -- 4 parties, 20 items, 17 entries loaded."
