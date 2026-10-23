#!/usr/bin/env bash
# Deploys the current commit to Railway, service by service (decision 113),
# until GitHub autodeploy is connected. Run from the repository root:
#
#   infra/railway/deploy.sh            # api → worker → beat → respaldo → web
#   infra/railway/deploy.sh api web    # only those
#
# Each service gets APP_VERSION = the commit, so /api/v1/salud/ and Sentry
# say which version is running.
set -euo pipefail
cd "$(dirname "$0")/../.."
VERSION=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin commit: el despliegue llevaría código que no está en Git." >&2
  exit 1
fi
SERVICES=("$@")
[ ${#SERVICES[@]} -gt 0 ] || SERVICES=(api worker beat respaldo web)

status() {
  railway deployment list --service "$1" --json 2>/dev/null \
    | python -c "import sys,json; d=json.load(sys.stdin); x=[y for y in d if y.get('id')=='$2']; print(x[0]['status'] if x else 'UNKNOWN')"
}

for service in "${SERVICES[@]}"; do
  railway variables --service "$service" --skip-deploys --set "APP_VERSION=$VERSION" >/dev/null
  case "$service" in
    api | worker | beat | respaldo) out=$(railway up --service "$service" --detach) ;;
    *) out=$(railway up --service "$service" --detach) ;;
  esac
  id=$(echo "$out" | grep -o 'id=[0-9a-f-]*' | cut -d= -f2)
  echo "$service: desplegando $id (versión $VERSION)"
  for _ in $(seq 1 40); do
    s=$(status "$service" "$id")
    case "$s" in
      SUCCESS) echo "$service: listo"; break ;;
      SKIPPED) echo "$service: sin cambios, sigue la versión en línea"; break ;;
      FAILED | CRASHED | REMOVED) echo "$service: $s" >&2; exit 1 ;;
    esac
    sleep 20
  done
done
echo "Versión $VERSION en línea:"
curl -fsS https://app.cobradia.com/api/v1/salud/; echo
