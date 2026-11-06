#!/usr/bin/env bash
# Runs ON THE SERVER (the deploy workflow pipes it over SSH): swaps the task-server container
# for the image tagged $1, waits for /health, and goes back to the previous image if the
# new one doesn't come up. The env file lives only on the server and is never in git.
#
#   ssh user@host 'bash -s -- <image tag>' < scripts/deploy-express.sh
set -euo pipefail

TAG="${1:?usage: deploy-express.sh <image tag>}"
NAME="${NAME:-wadzzo-express}"
IMAGE="${IMAGE:-wadzzo-express}"
ENV_FILE="${ENV_FILE:-$HOME/wadzzo/express.env}"
HOST_PORT="${HOST_PORT:-4000}"
WAIT_SECONDS="${WAIT_SECONDS:-90}"

# Staging: the image is already on the server (the workflow loaded it); don't start anything.
# Used before a cutover, so the new server isn't running beside the old one.
if [ "${LOAD_ONLY:-0}" = 1 ]; then
  docker image inspect "${IMAGE}:${TAG}" > /dev/null
  echo "Image ${IMAGE}:${TAG} is on the server. Not started (LOAD_ONLY=1)."
  exit 0
fi

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE: create it from apps/worker/.env.example first." >&2; exit 1; }

run() {
  # A stop gives the worker time to finish the job in hand (it exits on SIGTERM when done).
  docker run -d --name "$NAME" \
    --restart unless-stopped \
    --stop-timeout 120 \
    --env-file "$ENV_FILE" \
    -e PORT=8080 \
    -p "127.0.0.1:${HOST_PORT}:8080" \
    --log-opt max-size=10m --log-opt max-file=5 \
    "$1" > /dev/null
}

healthy() {
  for _ in $(seq 1 "$((WAIT_SECONDS / 3))"); do
    if curl -fsS "http://127.0.0.1:${HOST_PORT}/health" > /dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

# Remember what is running now, so there is something to go back to.
if docker inspect "$NAME" > /dev/null 2>&1; then
  docker tag "$(docker inspect --format '{{.Image}}' "$NAME")" "${IMAGE}:previous"
  docker stop -t 120 "$NAME" > /dev/null
  docker rm "$NAME" > /dev/null
fi

run "${IMAGE}:${TAG}"
if healthy; then
  echo "Task server ${TAG} is healthy."
  docker tag "${IMAGE}:${TAG}" "${IMAGE}:current"
  # Keep the last few images, drop the rest.
  docker images "$IMAGE" --format '{{.Tag}} {{.CreatedAt}}' \
    | grep -v -E '^(current|previous) ' | sort -k2 -r | awk 'NR>3 {print $1}' \
    | xargs -r -I{} docker rmi "${IMAGE}:{}" > /dev/null 2>&1 || true
  exit 0
fi

echo "Task server ${TAG} did not become healthy. Last logs:" >&2
docker logs --tail 60 "$NAME" >&2 || true
docker rm -f "$NAME" > /dev/null 2>&1 || true
if docker image inspect "${IMAGE}:previous" > /dev/null 2>&1; then
  echo "Going back to the previous image." >&2
  run "${IMAGE}:previous"
fi
exit 1
