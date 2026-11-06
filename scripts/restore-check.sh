#!/usr/bin/env bash
# Proves a backup can be restored: loads it into a scratch database and compares row counts.
#   SCRATCH_DATABASE_URL=postgresql://.../bolidesk_restore_check scripts/restore-check.sh backups/daily/bolidesk_X.dump
# The scratch database is dropped and recreated. Never point it at the live database.
set -euo pipefail

dump="${1:?Pass the .dump file to check}"
: "${SCRATCH_DATABASE_URL:?Set SCRATCH_DATABASE_URL to a throwaway database}"
: "${DATABASE_URL:?Set DATABASE_URL to the live database, so the check can refuse to drop it}"

# host:port/database, without user, password or query, so two spellings of one database compare equal.
target() {
  local u="${1%%\?*}"
  u="${u#*://}"
  u="${u##*@}"
  local host="${u%%/*}" db="${u#*/}" port=5432
  if [[ "$host" == \[* ]]; then
    # IPv6 literal: [::1] or [::1]:5433. The colons inside the brackets are not a port.
    [[ "$host" == *\]:* ]] && port="${host##*\]:}"
    host="${host%%\]*}]"
  elif [[ "$host" == *:* ]]; then
    port="${host##*:}"
    host="${host%:*}"
  fi
  host="${host,,}"
  case "$host" in localhost|"[::1]") host=127.0.0.1 ;; esac
  # Percent-decode the name: /boli%64esk is the database bolidesk.
  db="$(printf '%b' "${db//%/\\x}")"
  echo "$host:$port/$db"
}
[ "$(target "$SCRATCH_DATABASE_URL")" != "$(target "$DATABASE_URL")" ] || { echo "SCRATCH_DATABASE_URL must not be the live database" >&2; exit 1; }

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
