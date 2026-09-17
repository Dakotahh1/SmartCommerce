#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crea .env a partir de .env.example generando un valor aleatorio distinto para
# cada variable con valor "cambiar-...". Nunca sobrescribe un .env existente.
#
# Uso: scripts/init-env.sh [destino]   (por defecto .env en la raíz del repositorio)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT/.env}"

if [[ -e "$TARGET" ]]; then
  echo "Ya existe $TARGET: no se modifica (bórralo si quieres regenerarlo)." >&2
  exit 1
fi

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48
  else
    "$(command -v python3 || command -v python)" -c "import secrets; print(secrets.token_urlsafe(36))"
  fi
}

umask 077
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^([A-Z0-9_]+)=cambiar- ]]; then
    printf '%s=%s\n' "${BASH_REMATCH[1]}" "$(random_secret)"
  else
    printf '%s\n' "$line"
  fi
done <"$ROOT/.env.example" >"$TARGET"

echo "Creado $TARGET con secretos aleatorios (permisos 600). No lo subas al repositorio."
