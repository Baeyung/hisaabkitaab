#!/usr/bin/env bash
#
# Dumps the whole HisaabKitaab database (schema + data) to a gzipped .sql file
# that db-import.sh can replay into another Postgres.
#
# Usage:
#   ./db-export.sh                       # -> hisaabkitaab-YYYYmmdd-HHMMSS.sql.gz
#   ./db-export.sh backup.sql.gz
#   DB_URL=postgresql://user:pw@host:5432/db ./db-export.sh
#
# Runs pg_dump inside the running postgres container, so no client install is
# needed on the host and the client version always matches the server.
set -euo pipefail

CONTAINER=${PG_CONTAINER:-hisaabkitaab-postgres}
DB_URL=${DB_URL:-postgresql://hkadmin:admin@localhost:5432/hisaabkitaab}
OUT=${1:-hisaabkitaab-$(date +%Y%m%d-%H%M%S).sql.gz}

docker exec -i "$CONTAINER" pg_dump \
  --clean --if-exists --no-owner --no-privileges \
  "$DB_URL" | gzip > "$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
