#!/usr/bin/env bash
# Kiezruf staging on Scaleway (ENG-25). Run from the repository root; needs the scw CLI and Docker.
#   apps/api/scripts/scaleway-staging.sh secrets   asks for each secret (input hidden) and sets it on the API and worker
#   apps/api/scripts/scaleway-staging.sh migrate   asks for DATABASE_URL, applies migrations and seeds the tenant tree
#   apps/api/scripts/scaleway-staging.sh status    shows both containers' state and the API's /health
# Secrets never appear on screen or in this repository. Leave a prompt empty to keep the value already set.
set -euo pipefail

API_ID=fccc054e-f412-4a53-b2f2-a1487ddaf5e8
WORKER_ID=a132c625-72cc-4a30-a0fb-c58b0f073ed3
API_URL=https://vlinctastagingb191aca9-kiezruf-staging-api.functions.fnc.fr-par.scw.cloud
IMAGE=rg.fr-par.scw.cloud/vlincta-staging-api-7ba21567/kiezruf-api:staging-20261113

ask() { # ask NAME "hint" -> appends "secret-environment-variables.NAME=value" to ARGS when not empty
  local value
  read -r -s -p "$1 ($2): " value; echo
  if [ -n "$value" ]; then ARGS+=("secret-environment-variables.$1=$value"); fi
}

case "${1:-}" in
  secrets)
    ARGS=()
    ask DATABASE_URL "Supabase session pooler or direct URI, port 5432"
    ask SUPABASE_SERVICE_ROLE_KEY "Supabase > Project settings > API keys"
    ask AI_PROVIDER_API_KEY "vlincta AI key"
    ask S3_ACCESS_KEY "Scaleway access key (SCW...) with Object Storage access"
    ask S3_SECRET_KEY "its secret key"
    ask SMTP_PASSWORD "Scaleway secret key with Transactional Email access"
    if [ ${#ARGS[@]} -eq 0 ]; then echo "Nothing to set."; exit 0; fi
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
