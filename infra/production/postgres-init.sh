#!/bin/sh
# Runs once, when the database volume is created. The app connects as a
# NON-superuser role so that row-level security applies to it (doc 06 - 8).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE cobradia LOGIN PASSWORD :'app_password';
CREATE DATABASE cobradia OWNER cobradia;
SQL
