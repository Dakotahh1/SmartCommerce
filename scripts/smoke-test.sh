#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Pruebas de humo extremo a extremo de SmartCommerce (Docker Compose o staging).
#
# Recorre el flujo mínimo de la EP1 a través del gateway Nginx:
#   navegador → frontend (Nginx) → NestJS → PostgreSQL
#                                        → FastAPI (SmartMatch) → Open Food Facts
# e incluye controles negativos (401/403/400) que deben BLOQUEAR el acceso.
#
# Uso:
#   scripts/smoke-test.sh                          # contra http://localhost:8080
#   BASE_URL=https://staging.example scripts/smoke-test.sh
#
# Variables:
#   BASE_URL            URL del gateway web (por defecto http://localhost:8080)
#   API_URL             URL de la API (por defecto $BASE_URL/api)
#   SKIP_GATEWAY=true   omite las verificaciones de Nginx (API directa)
#   WAIT_SECONDS        espera máxima a que el stack esté sano (por defecto 180)
#   SMOKE_INGEST=true   ejecuta una ingesta real desde Open Food Facts (requiere promover a admin)
#   SMOKE_PROMOTE_CMD   comando que recibe el correo y lo promueve a admin
#                       (por defecto: scripts/promote-user.sh vía docker compose)
#   ALLOW_DEGRADED=true acepta /api/health = degraded (p. ej. sin salida a Internet)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
API_URL="${API_URL:-$BASE_URL/api}"
WAIT_SECONDS="${WAIT_SECONDS:-180}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_PROMOTE_CMD="${SMOKE_PROMOTE_CMD:-$SCRIPT_DIR/promote-user.sh}"
PY="$(command -v python3 || command -v python)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASSED=0
FAILED=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

pass() { PASSED=$((PASSED + 1)); green "  ✔ $*"; }
fail() { FAILED=$((FAILED + 1)); red "  ✘ $*"; }
# check <etiqueta> <comando...>: registra éxito o fallo según el código de salida del comando
check() {
  local label="$1"
  shift
  if "$@"; then pass "$label"; else fail "$label"; fi
}

# json <archivo> <expresión python sobre `d`>
json() { PYTHONIOENCODING=utf-8 "$PY" -c "import json,sys; d=json.load(open(sys.argv[1], encoding='utf-8')); print($2)" "$1"; }

# request <método> <url> [token] [cuerpo] → deja el cuerpo en $TMP/body y devuelve el código HTTP
request() {
  local method="$1" url="$2" token="${3:-}" body="${4:-}"
  local args=(-sS -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' -X "$method" "$url"
    -H 'Accept: application/json' -H "X-Request-Id: smoke-$(date +%s)-$RANDOM" --max-time 60)
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data "$body")
  local code
  code="$(curl "${args[@]}" 2>/dev/null)" || true
  echo "${code:-000}"
}

expect_status() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" == "$expected" ]]; then pass "$label (HTTP $actual)"; else fail "$label: se esperaba $expected y se obtuvo $actual — $(head -c 300 "$TMP/body" 2>/dev/null)"; fi
}

# ── 0. Esperar a que el stack esté sano ─────────────────────────────────────
step "Esperando a que la API responda en $API_URL/health (máx. ${WAIT_SECONDS}s)"
deadline=$((SECONDS + WAIT_SECONDS))
until [[ "$(request GET "$API_URL/health")" =~ ^(200|503)$ ]] && [[ "$(json "$TMP/body" "d['status']" 2>/dev/null)" =~ ^(ok|degraded)$ ]]; do
  if ((SECONDS > deadline)); then
    red "La API no quedó disponible a tiempo"; cat "$TMP/body" 2>/dev/null || true; exit 1
  fi
  sleep 3
done

# ── 1. Gateway web (frontend Nginx) ──────────────────────────────────────────
if [[ "${SKIP_GATEWAY:-false}" != "true" ]]; then
  step "Frontend (Nginx)"
  expect_status 200 "$(request GET "$BASE_URL/healthz")" "Gateway /healthz"
  code="$(request GET "$BASE_URL/app/inicio")"
  expect_status 200 "$code" "Ruta SPA /app/inicio (fallback a index.html)"
  check "index.html contiene la app Angular/Ionic" grep -qi '<ion-app\|<app-root' "$TMP/body"
  check "Cabecera Content-Security-Policy con script-src 'self'" grep -qi "^content-security-policy:.*script-src 'self'" "$TMP/headers"
  check "Cabecera X-Frame-Options: DENY" grep -qi '^x-frame-options: DENY' "$TMP/headers"
  expect_status 404 "$(request GET "$BASE_URL/.env")" "Archivos ocultos bloqueados (/.env)"
  expect_status 200 "$(request GET "$BASE_URL/manifest.webmanifest")" "Manifest PWA"
fi

# ── 2. Salud: NestJS ↔ PostgreSQL y NestJS ↔ FastAPI ────────────────────────
step "Salud de servicios (GET /api/health)"
request GET "$API_URL/health" >/dev/null
status="$(json "$TMP/body" "d['status']")"
check "NestJS → PostgreSQL: up" test "$(json "$TMP/body" "d['checks']['database']['status']")" = "up"
if [[ "$(json "$TMP/body" "d['checks']['smartmatch']['status']")" == "up" ]]; then
  pass "NestJS → FastAPI (SmartMatch): up"
else
  fail "SmartMatch no disponible"
fi
if [[ "$status" == "ok" ]]; then pass "Estado general: ok"
elif [[ "${ALLOW_DEGRADED:-false}" == "true" ]]; then yellow "  ! Estado general: degraded (permitido por ALLOW_DEGRADED)"
else fail "Estado general: $status"; fi

# ── 3. Catálogo público ─────────────────────────────────────────────────────
step "Catálogo público"
expect_status 200 "$(request GET "$API_URL/v1/products?limit=5")" "GET /v1/products"
expect_status 200 "$(request GET "$API_URL/v1/categories")" "GET /v1/categories"

# ── 4. Autenticación y flujo de usuario ─────────────────────────────────────
step "Registro, sesión y preferencias"
email="smoke.$(date +%s).$RANDOM@correo.cl"
password="Smoke-test-$(date +%s)"
code="$(request POST "$API_URL/v1/auth/register" "" "{\"email\":\"$email\",\"password\":\"$password\",\"displayName\":\"Prueba Humo\"}")"
expect_status 201 "$code" "POST /v1/auth/register"
token="$(json "$TMP/body" "d.get('accessToken','')" 2>/dev/null || true)"
refresh="$(json "$TMP/body" "d.get('refreshToken','')" 2>/dev/null || true)"

expect_status 200 "$(request GET "$API_URL/v1/auth/me" "$token")" "GET /v1/auth/me con token"
expect_status 200 "$(request PUT "$API_URL/v1/me/preferences" "$token" '{"weights":{"nutrition":40,"price":20,"processing":20,"environment":10,"availability":10},"diets":[],"excludedAllergens":["gluten"],"avoidHighIn":true,"preferredStores":[],"personalizationEnabled":true}')" "PUT /v1/me/preferences"
expect_status 200 "$(request GET "$API_URL/v1/recommendations?limit=5" "$token")" "GET /v1/recommendations"

# ── 5. Controles de seguridad (deben bloquear) ──────────────────────────────
step "Controles de seguridad (fallos controlados)"
expect_status 401 "$(request GET "$API_URL/v1/recommendations")" "Sin token → 401"
expect_status 401 "$(request GET "$API_URL/v1/auth/me" "token-invalido.abc.def")" "Token manipulado → 401"
expect_status 403 "$(request GET "$API_URL/v1/admin/ingestions" "$token")" "Usuario sin rol admin → 403"
expect_status 400 "$(request POST "$API_URL/v1/auth/register" "" '{"email":"no-es-correo","password":"123","displayName":"<script>"}')" "Datos inválidos → 400"
check "Formato de error uniforme (code=VALIDATION_ERROR)" test "$(json "$TMP/body" "d.get('code')")" = "VALIDATION_ERROR"
expect_status 400 "$(request POST "$API_URL/v1/auth/login" "" "{\"email\":\"$email\",\"password\":\"x\",\"extra\":\"campo-no-permitido\"}")" "Campos no permitidos → 400 (whitelist)"
expect_status 401 "$(request POST "$API_URL/v1/auth/login" "" "{\"email\":\"$email\",\"password\":\"Clave-incorrecta-1\"}")" "Contraseña incorrecta → 401"

# ── 6. Ingesta real y motor SmartMatch (opcional) ───────────────────────────
if [[ "${SMOKE_INGEST:-false}" == "true" ]]; then
  step "Ingesta desde Open Food Facts y recomendaciones SmartMatch"
  if "$SMOKE_PROMOTE_CMD" "$email" admin >/dev/null; then
    pass "Usuario promovido a admin"
    # El rol viaja en el JWT: se renueva la sesión para obtenerlo.
    code="$(request POST "$API_URL/v1/auth/login" "" "{\"email\":\"$email\",\"password\":\"$password\"}")"
    token="$(json "$TMP/body" "d.get('accessToken','')")"
    refresh="$(json "$TMP/body" "d.get('refreshToken','')")"
    code="$(request POST "$API_URL/v1/admin/ingestions" "$token" '{"country":"chile","category":"breakfast-cereals","pageSize":24}')"
    if [[ "$code" =~ ^20[01]$ ]]; then
      pass "Ingesta: $(json "$TMP/body" "f\"{d['status']} · obtenidos {d['counts']['fetched']} · válidos {d['counts']['valid']} · nuevos {d['counts']['inserted']} · rechazados {d['counts']['rejected']}\"")"
      request GET "$API_URL/v1/recommendations?limit=5" "$token" >/dev/null
      count="$(json "$TMP/body" "len(d.get('items', []))")"
      degraded="$(json "$TMP/body" "d.get('degraded')")"
      check "Recomendaciones desde FastAPI ($count ítems, degraded=$degraded)" test "$count" -gt 0 -a "$degraded" = "False"
      request GET "$API_URL/v1/products?limit=2" >/dev/null
      ids="$(json "$TMP/body" "json.dumps([p['id'] for p in d['items']][:2])")"
      expect_status 200 "$(request POST "$API_URL/v1/comparisons" "$token" "{\"productIds\":$ids}")" "POST /v1/comparisons"
    else
      # La fuente externa puede limitar o fallar: se informa sin ocultarlo.
      yellow "  ! Ingesta no disponible (HTTP $code): $(head -c 200 "$TMP/body")"
    fi
  else
    fail "No se pudo promover el usuario a admin con $SMOKE_PROMOTE_CMD"
  fi
fi

# ── 7. Cierre de sesión ─────────────────────────────────────────────────────
step "Cierre de sesión"
expect_status 204 "$(request POST "$API_URL/v1/auth/logout" "$token" "{\"refreshToken\":\"$refresh\"}")" "POST /v1/auth/logout"
expect_status 401 "$(request POST "$API_URL/v1/auth/refresh" "" "{\"refreshToken\":\"$refresh\"}")" "Refresh token revocado → 401"

printf '\n'
if ((FAILED > 0)); then
  red "Pruebas de humo: $PASSED correctas, $FAILED fallidas"
  exit 1
fi
green "Pruebas de humo: $PASSED correctas, 0 fallidas"
