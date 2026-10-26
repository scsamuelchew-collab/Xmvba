#!/usr/bin/env bash
# Applies the migrations to a throwaway database on a local Postgres and runs
# the SQL rule tests. Connection comes from the usual PG* env vars.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-xinmin_lobby_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/00_supabase_stub.sql supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f"
done
for f in supabase/tests/[1-9]*.sql; do
  echo "→ $f"
  "${PSQL[@]}" -o /dev/null -d "$DB" -f "$f"
done
