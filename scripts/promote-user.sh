#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Asigna un rol a un usuario existente en el stack de Docker Compose.
# El registro público siempre crea usuarios con rol `user`; los roles `admin` y
# `operator` se otorgan solo con acceso administrativo a la base de datos.
#
# Uso: scripts/promote-user.sh <correo> [admin|operator|user]
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

email="${1:?Uso: scripts/promote-user.sh <correo> [admin|operator|user]}"
role="${2:-admin}"
case "$role" in admin | operator | user) ;; *) echo "Rol inválido: $role" >&2; exit 2 ;; esac

# Variables pasadas a psql con --set y :'var' (sin concatenar SQL → sin inyección).
docker compose exec -T database sh -c \
  'psql --no-psqlrc -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --set=email="$1" --set=role="$2"' \
  _ "$email" "$role" <<'EOSQL'
WITH updated AS (
  UPDATE users SET role = :'role'::user_role, updated_at = now()
  WHERE email = lower(:'email')
  RETURNING 1
)
SELECT count(*) = 1 AS found FROM updated \gset
\if :found
  \echo 'Rol actualizado:' :'email' '→' :'role'
\else
  \warn 'No existe un usuario con ese correo'
  SELECT 'usuario-no-encontrado'::int;
\endif
EOSQL
