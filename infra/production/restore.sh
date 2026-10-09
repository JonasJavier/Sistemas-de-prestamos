#!/usr/bin/env bash
# Restores an encrypted backup (decision 101). Needs the PRIVATE gpg key in
# the keyring of whoever runs it.
#
#   ./restore.sh cobradia-db-<stamp>.dump.gpg                # monthly drill
#   ./restore.sh cobradia-db-<stamp>.dump.gpg cobradia \
#                cobradia-media-<stamp>.tar.gz.gpg            # real recovery
#
# The drill restores into a scratch database (cobradia_restore) and runs the
# integrity check on it; production is not touched. A real recovery targets
# «cobradia»: stop api, worker and beat first.
set -euo pipefail
cd "$(dirname "$0")"
DUMP=${1:?usage: restore.sh <db.dump.gpg> [database] [media.tar.gz.gpg]}
TARGET=${2:-cobradia_restore}
MEDIA=${3:-}
case "$TARGET" in
  '' | *[!a-z0-9_]*) echo "Nombre de base inválido: $TARGET" >&2; exit 1 ;;
esac
APP_DB_PASSWORD=$(grep '^APP_DB_PASSWORD=' .env | tail -n 1 | cut -d= -f2-)

psql() { docker compose exec -T db psql --username postgres -v ON_ERROR_STOP=1 "$@"; }
psql --dbname postgres -c "DROP DATABASE IF EXISTS $TARGET WITH (FORCE)"
psql --dbname postgres -c "CREATE DATABASE $TARGET OWNER cobradia"
gpg --batch --decrypt "$DUMP" \
  | docker compose exec -T db pg_restore --username postgres --dbname "$TARGET" --exit-on-error
echo "Base restaurada en «$TARGET»."

if [ -n "$MEDIA" ]; then
  gpg --batch --decrypt "$MEDIA" \
    | docker compose run --rm --no-deps -T --entrypoint tar api -C /app/media -xzf -
  echo "Archivos privados restaurados."
fi

# Same system as before: RLS forced on every company table and every book reconciled.
docker compose run --rm --no-deps -T \
  -e DATABASE_URL="postgres://cobradia:$APP_DB_PASSWORD@db:5432/$TARGET" \
  api python manage.py verificar_integridad
