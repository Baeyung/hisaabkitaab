#!/usr/bin/env bash
#
# Backs up the HisaabKitaab database into this folder (the repo root).
#
# Usage:
#   ./backup.sh                          # -> ./hisaabkitaab-YYYYmmdd-HHMMSS.sql.gz
#   ./backup.sh backup.sql.gz
#   DB_URL=postgresql://user:pw@host:5432/db ./backup.sh
#
# Restore a dump with src/backend/scripts/db-import.sh.
set -euo pipefail

# db-export.sh writes to the current directory, so cd'ing here IS the "copy the
# artifact to the root" step -- there is nothing to move afterwards.
cd "$(dirname "$0")"
exec ./src/backend/scripts/db-export.sh "$@"
