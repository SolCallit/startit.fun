#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies migrations, runs schema tests.
# Usage: db/test/run.sh   (requires initdb/pg_ctl on PATH or under /usr/lib/postgresql/*/bin)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")"
DATA="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
trap '"$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT

"$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c 'create database startit_test'
"${PSQL[@]}" -d startit_test -f "$ROOT/db/test/bootstrap_local.sql"
for f in "$ROOT"/db/migrations/*.sql; do "${PSQL[@]}" -d startit_test -f "$f"; done
for t in "$ROOT"/db/test/0*_test.sql; do "${PSQL[@]}" -d startit_test -f "$t"; done
