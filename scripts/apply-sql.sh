#!/usr/bin/env bash
# Runs ON THE SERVER: applies one SQL file to the database named in the worker's env file, using
# psql from a throwaway postgres container (nothing is installed, and the password is never
# printed or stored anywhere else). Files meant for this are additive and safe to run again.
#
#   scp packages/db/prisma/sql/<file>.sql scripts/apply-sql.sh user@host:wadzzo/
#   ssh user@host 'bash ~/wadzzo/apply-sql.sh ~/wadzzo/<file>.sql'
set -euo pipefail

FILE="${1:?usage: apply-sql.sh <file.sql>}"
ENV_FILE="${ENV_FILE:-$HOME/wadzzo/express.env}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }

docker run --rm --env-file "$ENV_FILE" -v "$(readlink -f "$FILE")":/migration.sql:ro \
  postgres:17-alpine sh -c 'psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f /migration.sql'
