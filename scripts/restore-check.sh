#!/usr/bin/env bash
# Proves a backup can be restored: loads it into a scratch database and compares row counts.
#   SCRATCH_DATABASE_URL=postgresql://.../bolidesk_restore_check scripts/restore-check.sh backups/daily/bolidesk_X.dump
# The scratch database is dropped and recreated. Never point it at the live database.
set -euo pipefail

dump="${1:?Pass the .dump file to check}"
: "${SCRATCH_DATABASE_URL:?Set SCRATCH_DATABASE_URL to a throwaway database}"
[ "${SCRATCH_DATABASE_URL%%\?*}" != "${DATABASE_URL:-}" ] || { echo "SCRATCH_DATABASE_URL must not be the live database" >&2; exit 1; }

url="${SCRATCH_DATABASE_URL%%\?*}"
name="${url##*/}"
admin="${url%/*}/postgres"
psql "$admin" -qc "DROP DATABASE IF EXISTS \"$name\"" -c "CREATE DATABASE \"$name\""
pg_restore --no-owner --no-privileges --dbname="$url" "$dump"

for table in Workspace Customer Invoice Payment CreditNote DocumentCounter; do
  printf '%-16s %s\n' "$table" "$(psql "$url" -tAc "SELECT count(*) FROM \"$table\"")"
done
psql "$url" -tAc "SELECT 'ledger check: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE count(*) || ' invoices disagree with their payments' END FROM \"Invoice\" i WHERE i.\"status\" = 'PAID' AND (SELECT coalesce(sum(\"amountPaise\"), 0) FROM \"Payment\" p WHERE p.\"invoiceId\" = i.\"id\") < i.\"totalPaise\" - coalesce((SELECT \"totalPaise\" FROM \"CreditNote\" c WHERE c.\"invoiceId\" = i.\"id\"), 0)"
echo "Restore check finished for $dump"
