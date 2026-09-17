#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Verifica la segmentación de red del stack de Docker Compose.
# Cada servicio debe alcanzar SOLO lo que necesita (ver docker-compose.yml):
#   host → frontend:8080            permitido   (único puerto publicado)
#   host → backend / python / db    bloqueado
#   frontend → backend              permitido   (red api)
#   frontend → python / database    bloqueado
#   backend → python / database     permitido   (redes services y data)
#   backend → Internet              bloqueado
#   python → database               bloqueado
#   python → Internet               permitido   (red egress, Open Food Facts)
#
# Uso: scripts/network-isolation-test.sh   (con el stack levantado)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf '\033[32m  ✔ %s\033[0m\n' "$*"; }
fail() { FAILED=$((FAILED + 1)); printf '\033[31m  ✘ %s\033[0m\n' "$*"; }

allowed() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "permitido: $label"; else fail "debería estar permitido: $label"; fi
}
blocked() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then fail "debería estar bloqueado: $label"; else pass "bloqueado: $label"; fi
}

tcp_from_host() { timeout 3 bash -c "</dev/tcp/127.0.0.1/$1"; }
in_frontend() { docker compose exec -T frontend sh -c "$1"; }
in_backend() { docker compose exec -T backend node -e "$1"; }
in_python() { docker compose exec -T python-service python -c "$1"; }

# Node: abre una conexión TCP y sale con 0 si conecta.
node_tcp() { printf "require('net').connect({host:'%s',port:%s,timeout:3000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))" "$1" "$2"; }
# Python: abre una conexión TCP y sale con 0 si conecta.
py_tcp() { printf "import socket,sys; socket.create_connection(('%s', %s), timeout=3); sys.exit(0)" "$1" "$2"; }

printf '\n\033[1m▸ Exposición en el host\033[0m\n'
allowed "host → frontend :8080" tcp_from_host 8080
blocked "host → backend :3000" tcp_from_host 3000
blocked "host → python-service :8000" tcp_from_host 8000
blocked "host → database :5432" tcp_from_host 5432

printf '\n\033[1m▸ Gateway frontend\033[0m\n'
allowed "frontend → backend (red api)" in_frontend "wget -q -T 5 -O /dev/null http://backend:3000/api/health/live"
blocked "frontend → python-service" in_frontend "wget -q -T 5 -O /dev/null http://python-service:8000/health"
blocked "frontend → database" in_frontend "nc -z -w 3 database 5432 || getent hosts database"

printf '\n\033[1m▸ API NestJS\033[0m\n'
allowed "backend → python-service (red services)" in_backend "$(node_tcp python-service 8000)"
allowed "backend → database (red data)" in_backend "$(node_tcp database 5432)"
blocked "backend → Internet" in_backend "fetch('https://world.openfoodfacts.org',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(0),()=>process.exit(1))"

printf '\n\033[1m▸ Servicio Python\033[0m\n'
blocked "python-service → database" in_python "$(py_tcp database 5432)"
allowed "python-service → Internet (red egress)" in_python "import urllib.request,sys; urllib.request.urlopen('https://world.openfoodfacts.org/robots.txt', timeout=10); sys.exit(0)"

printf '\n'
if ((FAILED > 0)); then
  printf '\033[31mAislamiento de red: %s correctas, %s fallidas\033[0m\n' "$PASSED" "$FAILED"
  exit 1
fi
printf '\033[32mAislamiento de red: %s correctas, 0 fallidas\033[0m\n' "$PASSED"
