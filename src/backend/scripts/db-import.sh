#!/usr/bin/env bash
#
# Replays a db-export.sh dump into a Postgres database. DESTRUCTIVE: the dump
# drops and recreates every object it contains, so anything already in the
# target database is replaced.
#
# Usage:
#   ./db-import.sh backup.sql.gz                                   # local container
#   DB_URL=postgresql://user:pw@server:5432/db ./db-import.sh backup.sql.gz
#   FORCE=1 ./db-import.sh backup.sql.gz                           # skip the prompt
#
# psql runs inside the local postgres container, so a remote target just needs
# to be reachable from there (host/port, not "localhost").
set -euo pipefail

FILE=${1:?usage: db-import.sh <dump.sql.gz>}
CONTAINER=${PG_CONTAINER:-hisaabkitaab-postgres}
DB_URL=${DB_URL:-postgresql://hkadmin:admin@localhost:5432/hisaabkitaab}

if [ "${FORCE:-0}" != "1" ]; then
  echo "About to overwrite ${DB_URL%%\?*} with $FILE."
  read -r -p "Type 'yes' to continue: " reply
  [ "$reply" = "yes" ] || { echo "aborted"; exit 1; }
fi

gunzip -c "$FILE" | docker exec -i "$CONTAINER" \
  psql -v ON_ERROR_STOP=1 --quiet "$DB_URL"

# Sanity check: the import is only useful if rows actually landed.
docker exec -i "$CONTAINER" psql -At "$DB_URL" -c "
  select relname || ': ' || n_live_tup
  from pg_stat_user_tables where n_live_tup > 0 order by relname;"
