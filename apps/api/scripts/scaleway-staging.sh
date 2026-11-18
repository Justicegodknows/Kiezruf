#!/usr/bin/env bash
# Kiezruf staging on Scaleway (ENG-25), project `kiezruf`. Run from the repository root; needs the scw CLI and Docker.
#   apps/api/scripts/scaleway-staging.sh secrets   sets every secret on the API and worker (database ones asked, hidden)
#   apps/api/scripts/scaleway-staging.sh migrate   asks for DATABASE_URL, applies migrations and seeds the tenant tree
#   apps/api/scripts/scaleway-staging.sh status    shows both containers' state and the API's /health
# Secrets never appear on screen or in this repository. `secrets` asks only for DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY
# and takes the AI and Scaleway keys from .env, because Scaleway replaces all of a container's secrets on each update.
set -euo pipefail

API_ID=0c495045-53cc-4770-8d6c-d09fcf55b21f
WORKER_ID=440a7597-9969-4bcc-a777-5518874c87e9
API_URL=https://kiezrufstaging80e46bb2-kiezruf-staging-api.functions.fnc.fr-par.scw.cloud
IMAGE=rg.fr-par.scw.cloud/kiezruf-staging-4ed3307d/kiezruf-api:staging-20261116

# Scaleway project `kiezruf` (its own organisation). The key comes from SCALEWAY_ACCESS_KEY and SCALEWAY_SECRET_KEY in
# the repository's .env when they are set there; otherwise the scw CLI's own profile is used.
export SCW_DEFAULT_PROJECT_ID=4ed3307d-d181-490b-9426-d3c83f6f81fc SCW_DEFAULT_ORGANIZATION_ID=4ed3307d-d181-490b-9426-d3c83f6f81fc SCW_DEFAULT_REGION=fr-par
if [ -f .env ] && grep -q '^SCALEWAY_SECRET_KEY=.' .env; then
  SCW_ACCESS_KEY="$(grep -E '^SCALEWAY_ACCESS_KEY=' .env | cut -d= -f2- | tr -d "\"' \r")"
  SCW_SECRET_KEY="$(grep -E '^SCALEWAY_SECRET_KEY=' .env | cut -d= -f2- | tr -d "\"' \r")"
  export SCW_ACCESS_KEY SCW_SECRET_KEY
fi

env_value() { # env_value NAME -> the value of NAME in the repository's .env, or nothing
  [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d "\"' \r" || true
}

ask() { # ask NAME "hint" [default] -> appends "secret-environment-variables.NAME=value" to ARGS; asks again until set
  local value="${3:-}"
  while [ -z "$value" ]; do read -r -s -p "$1 ($2): " value; echo; done
  ARGS+=("secret-environment-variables.$1=$value")
}

case "${1:-}" in
  secrets)
    # Scaleway replaces a container's whole set of secrets on every update, so this always sends all of them:
    # the two database values are asked for, the others come from .env (or are asked for when missing there).
    ARGS=()
    ask DATABASE_URL "Supabase session pooler or direct URI, port 5432"
    ask SUPABASE_SERVICE_ROLE_KEY "Supabase > Project settings > API keys, secret or service_role key"
    ask AI_PROVIDER_API_KEY "vlincta AI key" "$(env_value AI_PROVIDER_API_KEY)"
    ask S3_ACCESS_KEY "Scaleway access key (SCW...) with Object Storage access" "$(env_value SCALEWAY_ACCESS_KEY)"
    ask S3_SECRET_KEY "its secret key" "$(env_value SCALEWAY_SECRET_KEY)"
    ask SMTP_PASSWORD "Scaleway secret key with Transactional Email access" "$(env_value SCALEWAY_SECRET_KEY)"
    for id in "$API_ID" "$WORKER_ID"; do
      scw container container update "$id" "${ARGS[@]}" -o json >/dev/null
    done
    echo "Secrets set; both containers are redeploying. Check with: $0 status"
    ;;
  migrate)
    read -r -s -p "DATABASE_URL: " DATABASE_URL; echo
    export DATABASE_URL
    docker pull -q --platform linux/amd64 "$IMAGE" >/dev/null
    docker run --rm --platform linux/amd64 -e DATABASE_URL "$IMAGE" node apps/api/dist/db/migrate.js
    docker run --rm --platform linux/amd64 -e DATABASE_URL "$IMAGE" node apps/api/dist/db/seed/run.js
    ;;
  status)
    for id in "$API_ID" "$WORKER_ID"; do
      scw container container get "$id" -o json | python3 -I -c \
        "import json,sys; d=json.load(sys.stdin); print(d['name'], d['status'], (d.get('error_message') or '')[:300])"
    done
    curl -s -m 20 -w '  HTTP %{http_code}\n' "$API_URL/health" || true
    ;;
  *)
    sed -n '2,6p' "$0"; exit 1 ;;
esac
