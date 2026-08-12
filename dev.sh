#!/usr/bin/env bash
# Local dev: postgres in docker, everything else as a native dev server.
# Stop it all with ./dev-stop.sh
set -euo pipefail
set -m  # each service gets its own process group, so dev-stop.sh can kill its children too

cd "$(dirname "$0")"
RUN=logs/dev
mkdir -p "$RUN"

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi
export PDF_DUMP_DIR="$PWD/pdf-dumps"  # .env holds the in-container path

# the packaged stack squats on 8080, so the dev servers replace it; only postgres stays in docker
docker compose stop backend frontend admin renderer >/dev/null 2>&1 || true
docker compose up -d --wait postgres  # no-op if it is already up

# the renderer is otherwise only ever installed inside its image, so a checkout has nothing to run
[ -d src/renderer/node_modules ] || ( cd src/renderer && npm install && npx playwright install chromium )
for d in src/frontend src/admin; do
  [ -d "$d/node_modules" ] || ( cd "$d" && npm install )
done

start() { # name dir command...
  local name=$1 dir=$2; shift 2
  local pidfile="$RUN/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return
  fi
  ( cd "$dir" && exec "$@" ) >"$RUN/$name.log" 2>&1 &
  echo $! >"$pidfile"
  echo "$name  pid $!  $RUN/$name.log"
}

start renderer src/renderer npm start          # :3000
start backend  src/backend  ./mvnw spring-boot:run  # :8080
start frontend src/frontend npm start          # :4200
start admin    src/admin    npm start          # :4300

echo
echo "tail -f $RUN/*.log to watch them come up"
