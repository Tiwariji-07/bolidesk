#!/usr/bin/env bash
# Nightly Postgres backup for one BoliDesk shop.
#   DATABASE_URL=... BACKUP_DIR=/var/backups/bolidesk scripts/backup.sh
# Keeps 14 daily dumps and the first dump of each month for 12 months. Copy BACKUP_DIR off the server
# (another disk, Google Drive, S3): a backup on the same disk as the database is not a backup.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"
stamp="$(TZ=Asia/Kolkata date +%Y-%m-%d_%H%M)"
file="$BACKUP_DIR/daily/bolidesk_$stamp.dump"

# Custom format: compressed, and restorable table by table.
pg_dump --format=custom --no-owner --no-privileges --dbname="${DATABASE_URL%%\?*}" --file="$file.partial"
mv "$file.partial" "$file"

month="$(TZ=Asia/Kolkata date +%Y-%m)"
ls "$BACKUP_DIR/monthly/bolidesk_${month}"*.dump >/dev/null 2>&1 || cp "$file" "$BACKUP_DIR/monthly/"

ls -1t "$BACKUP_DIR"/daily/bolidesk_*.dump | tail -n +15 | xargs -r rm --
ls -1t "$BACKUP_DIR"/monthly/bolidesk_*.dump | tail -n +13 | xargs -r rm --
echo "Backup written: $file ($(du -h "$file" | cut -f1))"
