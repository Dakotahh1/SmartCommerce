#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Fallos controlados sobre el stack de Docker Compose:
#   1. Cae el servicio Python → la API sigue respondiendo en modo degradado
#      (/api/health = degraded y recomendaciones con el ranking base de respaldo).
#   2. Vuelve el servicio Python → la API se recupera sola (health = ok).
#   3. Cae PostgreSQL → /api/health responde 503 (down) sin exponer detalles internos.
#   4. Vuelve PostgreSQL → la API reconecta sin reiniciarse.
#
# Uso: scripts/resilience-test.sh   (con el stack levantado; BASE_URL por defecto http://localhost:8080)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
API_URL="${API_URL:-$BASE_URL/api}"
PY="$(command -v python3 || command -v python)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; docker compose start python-service database >/dev/null 2>&1 || true' EXIT

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf '\033[32m  ✔ %s\033[0m\n' "$*"; }
fail() { FAILED=$((FAILED + 1)); printf '\033[31m  ✘ %s\033[0m\n' "$*"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
check() {
  local label="$1"
  shift
  if "$@"; then pass "$label"; else fail "$label"; fi
}
json() { PYTHONIOENCODING=utf-8 "$PY" -c "import json,sys; d=json.load(open(sys.argv[1], encoding='utf-8')); print($2)" "$1"; }

# http <método> <ruta> [token] [cuerpo] → código HTTP; cuerpo en $TMP/body
http() {
  local args=(-sS -o "$TMP/body" -w '%{http_code}' -X "$1" "$API_URL$2" --max-time 30)
  [[ -n "${3:-}" ]] && args+=(-H "Authorization: Bearer $3")
  [[ -n "${4:-}" ]] && args+=(-H 'Content-Type: application/json' --data "$4")
  local code
  code="$(curl "${args[@]}" 2>/dev/null)" || true
  echo "${code:-000}"
}

# wait_health <estado esperado> <segundos>
wait_health() {
  local expected="$1" deadline=$((SECONDS + $2)) code status
  while ((SECONDS < deadline)); do
    code="$(http GET /health)"
    status="$(json "$TMP/body" "d.get('status')" 2>/dev/null || echo "?")"
    if [[ "$status" == "$expected" ]]; then echo "$code"; return 0; fi
    sleep 3
  done
  echo "$code"
  return 1
}

step "Preparación"
if [[ "$(wait_health ok 120)" != "200" ]]; then
  fail "El stack no está sano antes de iniciar"; exit 1
fi
email="resiliencia.$(date +%s).$RANDOM@correo.cl"
http POST /v1/auth/register "" "{\"email\":\"$email\",\"password\":\"Resiliencia-$(date +%s)\",\"displayName\":\"Prueba Resiliencia\"}" >/dev/null
token="$(json "$TMP/body" "d['accessToken']")"
http GET "/v1/products?limit=1" >/dev/null
products="$(json "$TMP/body" "d.get('total', 0)")"
pass "Usuario de prueba creado · productos en catálogo: $products"

step "1. Caída del servicio Python (SmartMatch)"
docker compose stop python-service >/dev/null
if code="$(wait_health degraded 60)"; then
  pass "/api/health = degraded (HTTP $code): la API sigue disponible"
else
  fail "/api/health no pasó a degraded"
fi
smartmatch="$(json "$TMP/body" "d['checks']['smartmatch']['status']")"
check "checks.smartmatch = $smartmatch (se espera down)" test "$smartmatch" = "down"

code="$(http GET "/v1/recommendations?limit=5" "$token")"
if [[ "$code" == "200" ]]; then
  degraded="$(json "$TMP/body" "d.get('degraded')")"
  if [[ "$products" -gt 0 ]]; then
    items="$(json "$TMP/body" "len(d.get('items', []))")"
    check "Recomendaciones con ranking de respaldo (HTTP 200, degraded=$degraded, $items ítems; se espera degraded=True)" test "$degraded" = "True"
  else
    pass "Recomendaciones responden 200 sin catálogo (el respaldo no se activa)"
  fi
else
  fail "GET /v1/recommendations respondió $code durante la caída de Python"
fi

step "2. Recuperación del servicio Python"
docker compose start python-service >/dev/null
if code="$(wait_health ok 120)"; then pass "/api/health = ok tras reiniciar python-service (HTTP $code)"; else fail "La API no se recuperó"; fi

step "3. Caída de PostgreSQL"
docker compose stop database >/dev/null
if code="$(wait_health down 60)"; then
  check "/api/health = down con HTTP $code (se espera 503)" test "$code" = "503"
  if grep -qiE 'password|stack|ECONNREFUSED|at [A-Za-z]+ \(' "$TMP/body"; then fail "La respuesta expone detalles internos"; else pass "La respuesta no expone detalles internos"; fi
else
  fail "/api/health no reportó down"
fi

step "4. Recuperación de PostgreSQL"
docker compose start database >/dev/null
if code="$(wait_health ok 120)"; then pass "La API reconectó con PostgreSQL sin reiniciarse (HTTP $code)"; else fail "La API no reconectó con PostgreSQL"; fi
code="$(http GET /v1/auth/me "$token")"
check "Sesión y datos intactos tras la recuperación (GET /v1/auth/me → HTTP $code)" test "$code" = "200"

printf '\n'
if ((FAILED > 0)); then
  printf '\033[31mResiliencia: %s correctas, %s fallidas\033[0m\n' "$PASSED" "$FAILED"
  exit 1
fi
printf '\033[32mResiliencia: %s correctas, 0 fallidas\033[0m\n' "$PASSED"
