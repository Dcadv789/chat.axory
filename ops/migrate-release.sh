#!/bin/sh
set -eu

if [ "$#" -ne 5 ]; then
  echo "Usage: $0 compose-file build-env project database-url-file network" >&2
  exit 2
fi

compose_file=$1
build_env=$2
project=$3
credential_file=$4
network=$5

compose_config() {
  docker compose --project-name "$project" --project-directory "$(dirname "$compose_file")" \
    --file "$compose_file" --env-file "$build_env" config --no-env-resolution "$@"
}

services=$(compose_config --services)
if ! printf '%s\n' "$services" | grep -qx api; then
  if printf '%s\n' "$services" | grep -qE '^api-pr-[0-9]+$'; then
    echo "Skipping the production migration job for this preview deployment."
    exit 0
  fi
  echo "The deployment does not have an API service." >&2
  exit 1
fi

image=$(compose_config --images api)
image_prefix="${project}_api:"
case "$image" in
  "$image_prefix"*) tag=${image#"$image_prefix"} ;;
  *) echo "Could not identify the API image for this release." >&2; exit 1 ;;
esac
case "$tag" in
  ''|*[!0-9a-f]*) echo "The API image must be tagged with its commit." >&2; exit 1 ;;
esac
if [ "${#tag}" -ne 40 ]; then
  echo "The API image must be tagged with its full commit." >&2
  exit 1
fi

image_id=$(docker image inspect --format '{{.Id}}' "$image")
echo "Applying the Prisma migrations for commit $tag."
docker run --rm --pull never --network "$network" --label traefik.enable=false \
  --mount "type=bind,source=$credential_file,target=/run/secrets/axchat-migrator-url,readonly" \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev \
  --env CHECKPOINT_DISABLE=1 --env PRISMA_TELEMETRY_DISABLED=1 \
  --entrypoint /bin/sh "$image_id" -ec '
    test -s /run/secrets/axchat-migrator-url
    DATABASE_URL=$(cat /run/secrets/axchat-migrator-url)
    export DATABASE_URL
    exec ./node_modules/.bin/prisma migrate deploy
  '
