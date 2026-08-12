#!/usr/bin/env bash
# Kills everything ./dev.sh started, postgres included.
set -uo pipefail

cd "$(dirname "$0")"
RUN=logs/dev

for pidfile in "$RUN"/*.pid; do
  [ -e "$pidfile" ] || continue
  name=$(basename "$pidfile" .pid)
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    for _ in {1..20}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -"$pid" 2>/dev/null || true
    echo "$name stopped"
  fi
  rm -f "$pidfile"
done

docker compose stop  # postgres, plus the packaged stack if it was left running
