#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Pruebas de integración de la EP2 sobre el stack de Docker Compose con la fuente simulada
# (docker-compose.source-mock.yml): flujo completo y real entre contenedores
#
#   Fuente web (off-mock) → FastAPI (validación, limpieza, normalización, deduplicación)
#     → NestJS (contrato zod, upsert idempotente, procedencia) → PostgreSQL (índice de búsqueda)
#     → API consultada como lo hace Angular
#
# Verifica: recuperación y calidad, idempotencia, búsqueda por relevancia, procedencia,
# reporte de calidad, lote programado asíncrono, caída de la fuente y correlación de logs.
#
# Uso:
#   COMPOSE_FILE=docker-compose.yml:docker-compose.source-mock.yml scripts/integration-test.sh
# Variables: BASE_URL (http://localhost:8080), API_URL ($BASE_URL/api)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
API_URL="${API_URL:-$BASE_URL/api}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$(command -v python3 || command -v python)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; docker compose start off-mock >/dev/null 2>&1 || true' EXIT

# Instantánea servida por off-mock: 24 registros, 23 válidos (1 sin nombre), sin duplicados.
EXPECTED_FETCHED=24
EXPECTED_VALID=23

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf '\033[32m  ✔ %s\033[0m\n' "$*"; }
fail() { FAILED=$((FAILED + 1)); printf '\033[31m  ✘ %s\033[0m\n' "$*"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
check() {
  local label="$1"
  shift
  if "$@"; then pass "$label"; else fail "$label — $(head -c 300 "$TMP/body" 2>/dev/null)"; fi
}
json() { PYTHONIOENCODING=utf-8 "$PY" -c "import json,sys; d=json.load(open(sys.argv[1], encoding='utf-8')); print($2)" "$1"; }
# py_true <expresión sobre d>: éxito si la expresión es verdadera para el último cuerpo
py_true() { [[ "$(json "$TMP/body" "bool($1)")" == "True" ]]; }
urlencode() { "$PY" -c "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))" "$1"; }

# http <método> <ruta> [token] [cuerpo] [request-id] → código HTTP; cuerpo en $TMP/body
http() {
  local args=(-sS -o "$TMP/body" -w '%{http_code}' -X "$1" "$API_URL$2" --max-time 90
    -H "X-Request-Id: ${5:-it-$(date +%s)-$RANDOM}")
  [[ -n "${3:-}" ]] && args+=(-H "Authorization: Bearer $3")
  [[ -n "${4:-}" ]] && args+=(-H 'Content-Type: application/json' --data "$4")
  local code
  code="$(curl "${args[@]}" 2>/dev/null)" || true
  echo "${code:-000}"
}
expect() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" == "$expected" ]]; then pass "$label (HTTP $actual)"; else fail "$label: se esperaba $expected y se obtuvo $actual — $(head -c 300 "$TMP/body")"; fi
}

step "Preparación: stack sano y operador de datos"
deadline=$((SECONDS + 180))
until [[ "$(http GET /health)" == "200" ]] && py_true "d['checks']['smartmatch']['status'] == 'up'"; do
  ((SECONDS > deadline)) && { fail "El stack no quedó sano"; exit 1; }
  sleep 3
done
pass "API, PostgreSQL y SmartMatch disponibles"
email="integracion.$(date +%s).$RANDOM@correo.cl"
password="Integracion-$(date +%s)"
expect 201 "$(http POST /v1/auth/register "" "{\"email\":\"$email\",\"password\":\"$password\",\"displayName\":\"Integracion\"}")" "Registro"
"$SCRIPT_DIR/promote-user.sh" "$email" operator >/dev/null
http POST /v1/auth/login "" "{\"email\":\"$email\",\"password\":\"$password\"}" >/dev/null
token="$(json "$TMP/body" "d['accessToken']")"
pass "Rol operator asignado y sesión renovada"

step "Recuperación → Python → NestJS → PostgreSQL"
rid="it-ingest-$(date +%s)-$RANDOM"
expect 201 "$(http POST /v1/admin/ingestions "$token" '{"country":"chile","category":"breakfast-cereals","pageSize":50}' "$rid")" "Ingesta desde la fuente"
check "Recuperados $EXPECTED_FETCHED registros" py_true "d['counts']['fetched'] == $EXPECTED_FETCHED"
check "Validación: $EXPECTED_VALID válidos y 1 rechazado (sin nombre)" py_true "d['counts']['valid'] == $EXPECTED_VALID and d['counts']['rejected'] == 1"
check "Persistidos (nuevos + actualizados + sin cambios = válidos)" py_true "sum(d['counts'][k] for k in ('inserted','updated','unchanged')) == $EXPECTED_VALID"
check "Reporte de calidad con cobertura y URL de la fuente" py_true "d['qualityReport']['validRatio'] > 0.9 and 'brand' in d['qualityReport']['fieldCoverage'] and '/api/v2/search' in d['qualityReport']['sourceApiUrl']"
check "Correlación: el X-Request-Id llega al log del servicio Python" \
  bash -c "docker compose logs --no-color python-service 2>/dev/null | grep -q '$rid'"

expect 201 "$(http POST /v1/admin/ingestions "$token" '{"country":"chile","category":"breakfast-cereals","pageSize":50}')" "Reingesta del mismo contenido"
check "Idempotencia: sin duplicados (todo sin cambios por hash)" py_true "d['counts']['inserted'] == 0 and d['counts']['unchanged'] == $EXPECTED_VALID"

step "Consulta como Angular: búsqueda por relevancia y procedencia"
expect 200 "$(http GET "/v1/products?q=avena&limit=5")" "Búsqueda 'avena'"
check "Ordenada por relevancia y primer resultado pertinente" py_true "d['items'] and d['items'][0]['relevance'] > 0 and 'avena' in d['items'][0]['name'].lower()"
expect 200 "$(http GET "/v1/products?q=$(urlencode 'sin azúcar')&limit=10")" "Búsqueda 'sin azúcar' (vocabulario de sellos)"
check "Encuentra productos por su sello en español" py_true "d['total'] >= 3"
product_id="$(json "$TMP/body" "d['items'][0]['id']")"
expect 200 "$(http GET "/v1/products/$product_id")" "Detalle del producto"
check "Procedencia: fuente, licencia y fecha de recuperación" py_true "d['provenance'][0]['code'] == 'openfoodfacts' and d['provenance'][0]['license'] == 'ODbL-1.0' and d['provenance'][0]['fetchedAt']"
expect 400 "$(http GET "/v1/products?q=$(urlencode $'avena\x01')")" "Texto con caracteres de control → 400"

step "Evaluación de la información recuperada"
expect 200 "$(http GET "/v1/admin/data-quality?days=1" "$token")" "Reporte de calidad"
check "Validez ≥ 90 % y catálogo 100 % indexado" py_true "d['validity']['validRatio'] >= 0.9 and d['catalog']['indexedRatio'] == 1"
check "Cobertura de la fuente por categoría" py_true "any(r['category'] == 'breakfast-cereals' and r['totalAvailable'] == $EXPECTED_FETCHED for r in d['sourceCoverage'])"
check "Métricas de la fuente medidas por Python" py_true "d['source'] and d['source']['requests'] > 0"

step "Ingesta programada (lote asíncrono)"
expect 202 "$(http POST /v1/admin/ingestions/schedule/run "$token" '{}')" "Lote aceptado"
batch_id="$(json "$TMP/body" "d['requestId']")"
deadline=$((SECONDS + 180))
until [[ "$(http GET /v1/admin/ingestions/schedule "$token")" == "200" ]] &&
  py_true "not d['running'] and d['lastBatch'] and d['lastBatch']['requestId'] == '$batch_id'"; do
  ((SECONDS > deadline)) && break
  sleep 3
done
check "Lote completado para todos los objetivos" py_true "d['lastBatch'] and d['lastBatch']['status'] == 'completed'"

step "Indisponibilidad de la fuente"
docker compose stop off-mock >/dev/null 2>&1
expect 502 "$(http POST /v1/admin/ingestions "$token" '{"country":"chile","category":"breakfast-cereals","pageSize":10}')" "Fuente caída → 502 controlado"
check "Código SOURCE_UNAVAILABLE sin detalles internos" py_true "d['code'] == 'SOURCE_UNAVAILABLE' and 'stack' not in d"
expect 200 "$(http GET "/v1/products?limit=1")" "El catálogo ya persistido sigue disponible"
expect 200 "$(http GET "/v1/admin/data-quality?days=1" "$token")" "Reporte tras la falla"
check "La falla queda registrada y medida" py_true "d['reliability']['failed'] >= 1 and d['reliability']['recentFailures'][0]['error'] and d['source']['errors'] >= 1"
docker compose start off-mock >/dev/null 2>&1
pass "Fuente restablecida"

printf '\n'
if ((FAILED > 0)); then
  printf '\033[31mIntegración EP2: %d correctas, %d fallidas\033[0m\n' "$PASSED" "$FAILED"
  exit 1
fi
printf '\033[32mIntegración EP2: %d correctas, 0 fallidas\033[0m\n' "$PASSED"
