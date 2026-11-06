#!/usr/bin/env bash
# Runs ON THE SERVER every minute (cron): Docker's restart policy covers a crash, this covers
# a worker that is running but stuck (its health check says unhealthy) or was left stopped.
#   * * * * * /home/ubuntu/wadzzo/express-watchdog.sh >> /home/ubuntu/wadzzo/watchdog.log 2>&1
set -euo pipefail
NAME="${NAME:-wadzzo-worker}"

docker inspect "$NAME" > /dev/null 2>&1 || exit 0   # not deployed yet
state="$(docker inspect --format '{{.State.Status}}' "$NAME")"
health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$NAME")"

if [ "$state" != "running" ]; then
  echo "$(date -Is) $NAME was $state: starting it"
  docker start "$NAME" > /dev/null
elif [ "$health" = "unhealthy" ]; then
  echo "$(date -Is) $NAME is unhealthy: restarting it"
  docker restart -t 120 "$NAME" > /dev/null
fi
