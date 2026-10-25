#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Despliegue controlado en staging con Terraform, verificación y rollback automático.
#
#   1. Recupera el estado de Terraform guardado en el host de staging (nunca en el repositorio).
#   2. Lee la etiqueta desplegada actualmente (`terraform output image_tag`) → candidata a rollback.
#   3. `terraform apply` con la nueva etiqueta inmutable (sha-<commit>) y la versión identificable.
#   4. Verifica: /api/health responde con la versión nueva, base de datos y SmartMatch arriba,
#      pruebas de humo contra la URL pública y lectura del catálogo.
#   5. Si algo falla, vuelve a aplicar la etiqueta anterior, la verifica y termina con error.
#   El estado se devuelve al host siempre (trap), incluso si el despliegue falla.
#
# Uso: scripts/deploy-staging.sh <image_tag>
# Variables: STAGING_DOCKER_HOST (ssh://deploy@host), STAGING_URL (https://staging...),
#            APP_VERSION, TF_VAR_* (secretos), STAGING_STATE_PATH (ruta del estado en el host)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TAG="${1:?Uso: scripts/deploy-staging.sh <image_tag>}"
: "${STAGING_DOCKER_HOST:?Define STAGING_DOCKER_HOST (ssh://usuario@host)}"
: "${STAGING_URL:?Define STAGING_URL (https://staging.<dominio>)}"
APP_VERSION="${APP_VERSION:-0.2.0}"
REMOTE_STATE="${STAGING_STATE_PATH:-smartcommerce/terraform/staging.tfstate}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infra/terraform/environments/staging"
SSH_TARGET="${STAGING_DOCKER_HOST#ssh://}"
WORK="$(mktemp -d)"
STATE="$WORK/staging.tfstate"
PY="$(command -v python3 || command -v python)"

log() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
err() { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; }
summary() { if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then printf '%s\n' "$*" >>"$GITHUB_STEP_SUMMARY"; fi; }

remote() { ssh -o BatchMode=yes "$SSH_TARGET" "$@"; }

# shellcheck disable=SC2317,SC2329 # se invoca desde `trap ... EXIT` (SC2317 en 0.9, SC2329 en 0.11)
push_state() {
  if [[ -s "$STATE" ]]; then
    # Escritura atómica y solo legible por el usuario de despliegue (contiene secretos).
    remote "umask 077; mkdir -p \"\$(dirname '$REMOTE_STATE')\" && cat > '$REMOTE_STATE.tmp' && mv '$REMOTE_STATE.tmp' '$REMOTE_STATE'" <"$STATE"
  fi
  rm -rf "$WORK"
}
trap push_state EXIT

log "Estado de Terraform desde el host de staging"
remote "cat '$REMOTE_STATE' 2>/dev/null || true" >"$STATE"
[[ -s "$STATE" ]] || { rm -f "$STATE"; echo "Sin estado previo: primer despliegue."; }

terraform -chdir="$TF_DIR" init -input=false -reconfigure -lockfile=readonly \
  -backend-config="path=$STATE" >/dev/null
PREVIOUS_TAG="$(terraform -chdir="$TF_DIR" output -raw image_tag 2>/dev/null || true)"
PREVIOUS_VERSION="$(terraform -chdir="$TF_DIR" output -raw app_version 2>/dev/null || true)"
echo "Desplegado actualmente: ${PREVIOUS_TAG:-ninguno}"

# El origen real del staging se conoce recién al desplegar: la API lo acepta en CORS junto con la
# WebView de Capacitor (https://localhost), en vez del dominio de ejemplo de terraform.tfvars.
apply() {
  terraform -chdir="$TF_DIR" apply -input=false -auto-approve -lock-timeout=120s \
    -var "docker_host=$STAGING_DOCKER_HOST" -var "image_tag=$1" -var "app_version=$2" \
    -var "cors_origins=[\"${STAGING_URL%/}\",\"https://localhost\"]"
}

# verify <versión esperada>: salud con la versión correcta, humo y catálogo
verify() {
  local expected="$1" deadline=$((SECONDS + HEALTH_TIMEOUT)) body
  log "Verificando $STAGING_URL (versión $expected)"
  while true; do
    body="$(curl -sS --max-time 10 "$STAGING_URL/api/health" 2>/dev/null || true)"
    if "$PY" - "$body" "$expected" <<'PY'; then break; fi
import json, sys
try:
    d = json.loads(sys.argv[1])
except ValueError:
    sys.exit(1)
ok = (
    d.get("version") == sys.argv[2]
    and d.get("status") in ("ok", "degraded")
    and d["checks"]["database"]["status"] == "up"
    and d["checks"]["smartmatch"]["status"] == "up"
)
sys.exit(0 if ok else 1)
PY
    if ((SECONDS > deadline)); then
      err "Salud no válida tras ${HEALTH_TIMEOUT}s: ${body:0:300}"
      return 1
    fi
    sleep 5
  done
  echo "Salud OK: ${body:0:300}"
  # La fuente externa puede degradarse sin que sea un error del despliegue.
  BASE_URL="$STAGING_URL" ALLOW_DEGRADED=true SMOKE_INGEST=false WAIT_SECONDS=60 \
    "$ROOT/scripts/smoke-test.sh" || return 1
  curl -sSf --max-time 15 "$STAGING_URL/api/v1/products?limit=1" >/dev/null || return 1
}

NEW_VERSION="$APP_VERSION+$TAG"
log "Aplicando $TAG"
if apply "$TAG" "$NEW_VERSION" && verify "$NEW_VERSION"; then
  summary "### 🚀 Staging desplegado" "- Versión: \`$NEW_VERSION\`" "- URL: $STAGING_URL" "- Anterior: \`${PREVIOUS_TAG:-ninguna}\`"
  exit 0
fi

err "El despliegue de $TAG falló la verificación"
if [[ -z "$PREVIOUS_TAG" || "$PREVIOUS_TAG" == "$TAG" ]]; then
  summary "### ❌ Despliegue fallido sin versión anterior a la que volver (\`$TAG\`)"
  exit 1
fi
log "Rollback a $PREVIOUS_TAG"
if apply "$PREVIOUS_TAG" "${PREVIOUS_VERSION:-$APP_VERSION+$PREVIOUS_TAG}" &&
  verify "${PREVIOUS_VERSION:-$APP_VERSION+$PREVIOUS_TAG}"; then
  summary "### ↩️ Rollback aplicado" "- Fallida: \`$TAG\`" "- Restaurada: \`$PREVIOUS_TAG\`"
else
  summary "### 🔥 Rollback fallido: intervención manual requerida (\`$PREVIOUS_TAG\`)"
fi
exit 1
