#!/usr/bin/env bash
#
# Nightly MongoDB backup for a self-hosted Rovex.
#
#   bash scripts/self-host/backup-mongo.sh [backup-dir]
#
# Defaults to ~/rovex-backups and keeps 14 days. It dumps from the Compose container, so it works
# whether or not mongosh is installed on the host.
#
# Schedule it with launchd or cron, and copy the folder somewhere that is not this Mac:
#
#   0 3 * * *  cd /path/to/OpenStock && bash scripts/self-host/backup-mongo.sh >> ~/rovex-backups/backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${1:-$HOME/rovex-backups}"
KEEP_DAYS=14
STAMP="$(date +%Y-%m-%d_%H%M)"
CONTAINER="${MONGO_CONTAINER:-mongodb}"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Container '$CONTAINER' is not running; nothing to back up." >&2
    exit 1
fi

echo "Dumping $CONTAINER to $BACKUP_DIR/$STAMP"
# --archive streams a single file; --gzip keeps it small. Credentials come from the container's env.
docker exec "$CONTAINER" sh -c 'mongodump --quiet --gzip --archive' > "$BACKUP_DIR/$STAMP.archive.gz"

# A dump that is empty is worse than no dump: it looks like a backup.
SIZE="$(wc -c < "$BACKUP_DIR/$STAMP.archive.gz" | tr -d ' ')"
if [[ "$SIZE" -lt 1024 ]]; then
    echo "Backup is only ${SIZE} bytes — treating it as a failure." >&2
    rm -f "$BACKUP_DIR/$STAMP.archive.gz"
    exit 1
fi

echo "Wrote $BACKUP_DIR/$STAMP.archive.gz (${SIZE} bytes)"

# Keep the last N days, delete the rest.
find "$BACKUP_DIR" -name '*.archive.gz' -type f -mtime "+$KEEP_DAYS" -print -delete

echo "Done. Restore with:"
echo "  docker exec -i $CONTAINER sh -c 'mongorestore --gzip --archive --drop' < $BACKUP_DIR/$STAMP.archive.gz"
