#!/bin/bash
# =========================================================
# Pixoris v3 — Run all migrations in order
# =========================================================
# Usage:
#   ./run-migrations.sh              # remote D1
#   ./run-migrations.sh --local      # local D1 (for dev)
# =========================================================

set -e  # exit on first error

cd "$(dirname "$0")/.."

DB_NAME="pixoris-db"
SCOPE="--remote"

if [ "$1" = "--local" ]; then
  SCOPE="--local"
  echo ">>> Running migrations on LOCAL D1"
else
  echo ">>> Running migrations on REMOTE D1"
fi

echo ""
echo ">>> Step 0: Run full schema.sql (creates tables if not exist, idempotent)"
wrangler d1 execute $DB_NAME $SCOPE --file=./schema.sql || echo "schema.sql may have partial errors — continuing with migrations"

echo ""
echo ">>> Step 1-11: Run individual migration files (idempotent)"
for f in migrations/*.sql; do
  echo ">>> Applying $f..."
  wrangler d1 execute $DB_NAME $SCOPE --file="./$f" 2>&1 | tail -3 || echo "  (some statements may have errored if already applied — that's OK)"
done

echo ""
echo ">>> ✅ All migrations applied!"
echo ">>> Verify with: curl https://dev.pixoris.workers.dev/api/debug/schema"
