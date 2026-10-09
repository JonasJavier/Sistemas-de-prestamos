#!/usr/bin/env bash
# Encrypted backup of the database and the private files (doc 10 - 3,
# decision 101). Daily from cron, e.g.:
#   30 3 * * * /opt/cobradia/infra/production/backup.sh >> /var/log/cobradia-backup.log 2>&1
# Encrypted with the PUBLIC key only: this server cannot read its backups.
set -euo pipefail
cd "$(dirname "$0")"

setting() { grep "^$1=" .env | tail -n 1 | cut -d= -f2-; }
KEY=$(setting BACKUP_PUBLIC_KEY)
DIR=$(setting BACKUP_DIR)
REMOTE=$(setting BACKUP_REMOTE)
[ -n "$KEY" ] && [ -f "$KEY" ] || { echo "Falta BACKUP_PUBLIC_KEY (la llave pública)." >&2; exit 1; }
DIR=${DIR:-/var/backups/cobradia}
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
encrypt() { gpg --batch --yes --trust-model always --recipient-file "$KEY" --encrypt --output "$1"; }

# All companies: pg_dump runs as the superuser, so row-level security does not hide rows.
docker compose exec -T db pg_dump --username postgres --format custom cobradia \
  | encrypt "$DIR/cobradia-db-$STAMP.dump.gpg"
docker compose run --rm --no-deps -T --entrypoint tar api -C /app/media -czf - . \
  | encrypt "$DIR/cobradia-media-$STAMP.tar.gz.gpg"
echo "$(date -u +%FT%TZ) respaldo listo: $STAMP"

# Off the server (doc 10 - 3); the remote keeps its own retention.
if [ -n "$REMOTE" ]; then
  rclone copy "$DIR" "$REMOTE" --include "cobradia-*-$STAMP.*"
  echo "$(date -u +%FT%TZ) copiado a $REMOTE"
else
  echo "AVISO: sin BACKUP_REMOTE el respaldo queda solo en este servidor." >&2
fi
# Two weeks stay on the server.
find "$DIR" -name 'cobradia-*.gpg' -mtime +14 -delete
