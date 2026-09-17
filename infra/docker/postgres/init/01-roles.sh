#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────────
# Inicialización de PostgreSQL (solo la primera vez, con el volumen vacío).
# Aplica mínimo privilegio:
#   - DB_OWNER_USER: dueño del esquema public, lo usa SOLO el contenedor `migrate` (DDL).
#   - DB_APP_USER:   rol de la API NestJS, solo SELECT/INSERT/UPDATE/DELETE (sin DDL).
# El superusuario de la imagen no lo usa ningún servicio de la aplicación.
# ──────────────────────────────────────────────────────────────────────────────
set -eu

: "${DB_OWNER_USER:?Falta DB_OWNER_USER}"
: "${DB_OWNER_PASSWORD:?Falta DB_OWNER_PASSWORD}"
: "${DB_APP_USER:?Falta DB_APP_USER}"
: "${DB_APP_PASSWORD:?Falta DB_APP_PASSWORD}"

psql --no-psqlrc -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=db_name="$POSTGRES_DB" \
  --set=owner_user="$DB_OWNER_USER" --set=owner_password="$DB_OWNER_PASSWORD" \
  --set=app_user="$DB_APP_USER" --set=app_password="$DB_APP_PASSWORD" <<'EOSQL'
CREATE ROLE :"owner_user" LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 50;

-- Nadie más puede conectarse ni crear objetos por defecto.
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO :"owner_user";
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"owner_user";
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Todo objeto que creen las migraciones queda disponible para la API solo con DML.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_user" IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO :"app_user";

-- Límites de seguridad para la sesión de la API.
ALTER ROLE :"app_user" SET statement_timeout = '15s';
ALTER ROLE :"app_user" SET idle_in_transaction_session_timeout = '60s';
EOSQL

echo "Roles ${DB_OWNER_USER} (owner) y ${DB_APP_USER} (app) creados en ${POSTGRES_DB}"
