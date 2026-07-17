#!/usr/bin/env bash
#
# Seeds cloth-shop demo data for the PURCHASE screen into an EXISTING account.
#
# Unlike load-dummy-data.sh (which signs up its own throwaway users), this points
# at an account you already have, so the data shows up on the login you actually
# use. Items are created with salePrice != costPrice on purpose: the SALE screen
# prefills a line's rate from salePrice and PURCHASE prefills from costPrice, so
# differing values make it obvious which screen you're on.
#
# Requirements: bash + curl.
#
# Usage:
#   EMAIL=you@example.com PASSWORD=yourpassword ./load-purchase-demo.sh
#   BASE_URL=http://localhost:8080 EMAIL=... PASSWORD=... ./load-purchase-demo.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
info() { printf '    \033[0;90m%s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

[ -n "$EMAIL" ]    || die "Set EMAIL to the account to seed, e.g. EMAIL=you@example.com"
[ -n "$PASSWORD" ] || die "Set PASSWORD for $EMAIL"

extract_id() { grep -o '"id":"[^"]*"' | head -n1 | sed 's/^"id":"//; s/"$//'; }

auth_post() { # <path> <json>
  curl -sS -X POST "$BASE_URL$1" -u "$EMAIL:$PASSWORD" \
    -H 'Content-Type: application/json' -d "$2"
}

say "Checking $BASE_URL as $EMAIL"
code=$(curl -sS -o /dev/null -w '%{http_code}' -u "$EMAIL:$PASSWORD" "$BASE_URL/api/parties")
[ "$code" = "200" ] || die "Auth/store check failed (HTTP $code). Is the backend up, and are the credentials right?"
info "Authenticated."

# The store is resolved server-side from the login, but /api/parties and
# /api/store-items still want an explicit storeId, so read the user's first one.
STORE=$(curl -sS -u "$EMAIL:$PASSWORD" "$BASE_URL/api/stores" | extract_id)
[ -n "$STORE" ] || die "No store on this account — create one in Store Settings first."
info "Store: $STORE"

say "Creating suppliers"
mk_party() { # <name> <contact>
  auth_post /api/parties "{\"storeId\":\"$STORE\",\"name\":\"$1\",\"contact\":\"$2\",\"address\":\"\"}" | extract_id
}
# Keep the ids: an event with a null partyId records no party movement at all, so
# the baqaya would float free of any khata. The UI has the same rule — it matches
# the typed name back to a loaded party and sends that id.
CRESCENT=$(mk_party "Crescent Mills"  "03121110000")
[ -n "$CRESCENT" ] || die "Could not create supplier Crescent Mills"
info "Crescent Mills  -> $CRESCENT"
CHENAB=$(mk_party "Chenab Textiles" "03121110001")
[ -n "$CHENAB" ] || die "Could not create supplier Chenab Textiles"
info "Chenab Textiles -> $CHENAB"

say "Creating cloth items (salePrice / costPrice differ on purpose)"
mk_item() { # <name> <unit> <salePrice> <costPrice>
  auth_post /api/store-items \
    "{\"storeId\":\"$STORE\",\"name\":\"$1\",\"unit\":\"$2\",\"salePrice\":$3,\"costPrice\":$4}" | extract_id
}
# Keep the ids here too: an event with a null itemId makes the backend create a
# *new* item from the name (unit "gz", prices 0), so reusing the name alone would
# silently fork the catalog into a priceless duplicate.
CHAMKI=$(mk_item "Chamki-101" "gz" 450 320)
[ -n "$CHAMKI" ] || die "Could not create item Chamki-101"
info "Chamki-101  sale 450 / cost 320  -> $CHAMKI"
LAWN=$(mk_item "Lawn-202" "gz" 300 210)
[ -n "$LAWN" ] || die "Could not create item Lawn-202"
info "Lawn-202    sale 300 / cost 210  -> $LAWN"
SILK=$(mk_item "Silk-303" "gz" 900 640)
[ -n "$SILK" ] || die "Could not create item Silk-303"
info "Silk-303    sale 900 / cost 640  -> $SILK"

say "Publishing purchases"
TODAY=$(date +%F)

# Credit purchase: bill 32,000, paid 20,000 -> 12,000 still owed to the supplier.
auth_post /api/event "{
  \"transactionEvent\":\"PURCHASE\",
  \"cashAmount\":20000,\"billAmount\":32000,
  \"description\":\"Chamki stock from Crescent Mills (part payment)\",
  \"billNumber\":\"DEMO-PUR-001\",\"billDate\":\"$TODAY\",
  \"party\":{\"partyId\":\"$CRESCENT\",\"name\":\"Crescent Mills\"},
  \"items\":[{\"itemId\":\"$CHAMKI\",\"name\":\"Chamki-101\",\"quantity\":100,\"itemSoldAt\":320}]
}" >/dev/null && info "DEMO-PUR-001  bill 32,000 / paid 20,000 -> you owe 12,000"

# Cash purchase: settled in full, no khata.
auth_post /api/event "{
  \"transactionEvent\":\"PURCHASE\",
  \"cashAmount\":10500,\"billAmount\":10500,
  \"description\":\"Lawn stock, cash purchase\",
  \"billNumber\":\"DEMO-PUR-002\",\"billDate\":\"$TODAY\",
  \"party\":null,
  \"items\":[{\"itemId\":\"$LAWN\",\"name\":\"Lawn-202\",\"quantity\":50,\"itemSoldAt\":210}]
}" >/dev/null && info "DEMO-PUR-002  bill 10,500 / paid in full -> settled"

say "Done — open New Entry → Purchase"
