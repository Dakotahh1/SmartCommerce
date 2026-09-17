# 8. Variables de entorno y secretos

> Principio: **la configuración vive fuera del código**. Los valores no sensibles se versionan como ejemplo (`.env.example`) y se configuran en **GitHub Actions Variables**; los sensibles solo existen en archivos `.env` locales (ignorados por git) y en **GitHub Actions Secrets**. gitleaks bloquea el pipeline si un secreto llega al repositorio.

## 8.1 Dónde vive cada cosa

| Contexto | Variables no sensibles | Secretos | Archivo de ejemplo |
|---|---|---|---|
| Docker Compose (local / staging efímero) | `.env` en la raíz | `.env` en la raíz | [`.env.example`](../.env.example) |
| Backend sin Docker | `backend/.env` | `backend/.env` | [`backend/.env.example`](../backend/.env.example) |
| Servicio Python sin Docker | `python-service/.env` | `python-service/.env` | [`python-service/.env.example`](../python-service/.env.example) |
| Frontend | `src/environments/*.ts` (solo URL de la API, **sin secretos**: todo lo que va al navegador es público) | — | — |
| GitHub Actions | **Settings › Secrets and variables › Actions › Variables** | **… › Secrets** (a nivel de repositorio o del ambiente `staging`) | este documento |
| Terraform | `environments/<ambiente>/terraform.tfvars` (no sensibles) | `TF_VAR_*` desde GitHub Secrets | `terraform.tfvars.example` |

Reglas:

- `.env`, `.env.*` (excepto `.env.example`), `*.tfstate`, `*.tfvars` con secretos, llaves y certificados están en [`.gitignore`](../.gitignore).
- Los servicios **validan su configuración al arrancar** (zod en NestJS, Pydantic Settings en FastAPI) y se detienen si falta un secreto o no cumple el largo mínimo (*fail fast*). Docker Compose también falla antes de crear contenedores si falta un secreto obligatorio (`${VAR:?mensaje}`).
- Los valores `cambiar-...` de los ejemplos son marcadores: `JWT_ACCESS_SECRET` e `INTERNAL_API_TOKEN` no cumplen el largo mínimo (≥ 32), así que la API no arranca hasta reemplazarlos. `scripts/init-env.sh` crea `.env` con un valor aleatorio distinto para cada marcador y permisos `600`.
- Los secretos nunca se registran: Pino redacta `authorization`, `password` y tokens; FastAPI usa `SecretStr`; en CI se enmascaran con `::add-mask::`.

## 8.2 Variables de Docker Compose (`.env` raíz)

| Variable | Tipo | Servicio(s) | Por defecto | Descripción |
|---|---|---|---|---|
| `APP_ENV` | Variable | backend, python-service, migrate | `staging` | `development` · `test` · `staging` · `production` (en `production` FastAPI no expone `/docs`) |
| `APP_VERSION` | Variable | backend | `0.1.0` | Versión reportada por `/api/health` |
| `LOG_LEVEL` / `PYTHON_LOG_LEVEL` | Variable | backend / python-service | `info` / `INFO` | Nivel de logs estructurados (JSON) |
| `IMAGE_PREFIX` / `IMAGE_TAG` | Variable | todas las imágenes | `smartcommerce` / `local` | En CI: `ghcr.io/<owner>/smartcommerce` y el SHA del commit |
| `FRONTEND_BIND` / `FRONTEND_PORT` | Variable | frontend | `127.0.0.1` / `8080` | Interfaz y puerto publicados en el host (único puerto expuesto) |
| `CORS_ORIGINS` | Variable | backend | `http://localhost:8080,https://localhost` | Orígenes permitidos (web y WebView de Capacitor) |
| `SWAGGER_ENABLED` | Variable | backend | `true` | Publica `/api/docs` |
| `THROTTLE_ENABLED` / `THROTTLE_LIMIT` | Variable | backend | `true` / `120` | *Rate limiting* global por minuto |
| `DB_NAME` | Variable | database, backend, migrate | `smartcommerce` | Base de datos |
| `POSTGRES_SUPERUSER` | Variable | database | `postgres` | Superusuario usado solo para inicializar el contenedor |
| `POSTGRES_SUPERUSER_PASSWORD` | **Secreto** | database | — | Contraseña del superusuario |
| `DB_OWNER_USER` | Variable | database, migrate | `smartcommerce_owner` | Rol dueño del esquema (DDL, solo migraciones) |
| `DB_OWNER_PASSWORD` | **Secreto** | database, migrate | — | Contraseña del rol owner |
| `DB_APP_USER` | Variable | database, backend | `smartcommerce_app` | Rol de la API (solo DML) |
| `DB_APP_PASSWORD` | **Secreto** | database, backend | — | Contraseña del rol app |
| `DB_POOL_MAX` | Variable | backend | `10` | Conexiones máximas del pool |
| `JWT_ACCESS_SECRET` | **Secreto** | backend | — | Firma HS256 de los access tokens (≥ 32 caracteres) |
| `JWT_ACCESS_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` | Variable | backend | `900` / `7` | Duración de las sesiones |
| `INTERNAL_API_TOKEN` | **Secreto** | backend, python-service | — | Token compartido NestJS → FastAPI (`X-Internal-Token`, ≥ 32 caracteres) |
| `SMARTMATCH_TIMEOUT_MS` / `SMARTMATCH_INGESTION_TIMEOUT_MS` | Variable | backend | `5000` / `45000` | Timeouts hacia el servicio Python |
| `OFF_BASE_URL` / `OFF_USER_AGENT` | Variable | python-service | API oficial / `SmartCommerce/0.1.0 (…)` | Fuente web y User-Agent identificable exigido por Open Food Facts |
| `OFF_TIMEOUT_SECONDS` / `OFF_SEARCH_RATE_PER_MINUTE` / `OFF_CACHE_TTL_SECONDS` | Variable | python-service | `10` / `8` / `300` | Resiliencia y respeto de los límites de la fuente |

Variables fijadas por la topología (no configurables desde `.env`): `DB_HOST=database`, `PYTHON_SERVICE_URL=http://python-service:8000`, `API_UPSTREAM=http://backend:3000`, `TRUST_PROXY=true`.

## 8.3 GitHub Actions

### Secrets

| Secreto | Alcance | Uso | Si no existe |
|---|---|---|---|
| `POSTGRES_SUPERUSER_PASSWORD` | ambiente `staging` | Staging efímero (Compose) y `terraform plan` | CI genera uno aleatorio por ejecución y lo enmascara |
| `DB_OWNER_PASSWORD` | ambiente `staging` | Staging efímero y Terraform | Aleatorio enmascarado |
| `DB_APP_PASSWORD` | ambiente `staging` | Staging efímero y Terraform | Aleatorio enmascarado |
| `JWT_ACCESS_SECRET` | ambiente `staging` | Staging efímero y Terraform | Aleatorio enmascarado |
| `INTERNAL_API_TOKEN` | ambiente `staging` | Staging efímero y Terraform | Aleatorio enmascarado |
| `GITHUB_TOKEN` | automático | Publicar imágenes en GHCR (`packages: write` solo en ese job, solo en `main`) | — |

Las pruebas de integración usan una base PostgreSQL de servicio del propio job con credenciales **efímeras** generadas en la ejecución (no reutilizables fuera del runner).

### Variables

| Variable | Valor sugerido | Uso |
|---|---|---|
| `APP_VERSION` | `0.1.0` | Etiqueta de versión en imágenes y `/api/health` |
| `OFF_USER_AGENT` | `SmartCommerce/0.1.0 (contacto: <correo del equipo>)` | Identificación ante Open Food Facts en el staging efímero |
| `SMOKE_INGEST` | `true` | Ejecuta una ingesta real en las pruebas de humo (si la fuente falla se informa sin bloquear) |
| `TRIVY_SEVERITY` | `CRITICAL,HIGH` | Severidades que bloquean el escaneo de imágenes |
| `STAGING_DOCKER_HOST` | `unix:///var/run/docker.sock` | Daemon Docker contra el que Terraform planifica el staging (en un host real: `ssh://deploy@<ip>`) |

### Configuración paso a paso

1. **Settings › Environments › New environment** → `staging` (opcional: *required reviewers* para aprobar despliegues).
2. En el ambiente `staging` → **Add environment secret** para cada secreto de la tabla. Generar valores con `openssl rand -base64 48`.
3. **Settings › Secrets and variables › Actions › Variables** → crear las variables no sensibles.
4. **Settings › Actions › General › Workflow permissions** → *Read repository contents* (el workflow eleva permisos solo donde los necesita).

## 8.4 Mínimo privilegio aplicado

| Ámbito | Medida |
|---|---|
| Base de datos | Superusuario solo para inicializar; rol `owner` solo para migraciones; la API usa `app` con DML y `statement_timeout` |
| Contenedores | Usuarios sin privilegios (`node`, uid 10001, uid 101), `read_only`, `cap_drop: ALL`, `no-new-privileges`, límites de CPU/memoria |
| Redes | Solo el gateway publica un puerto (ligado a `127.0.0.1` por defecto); `services` y `data` son internas; solo `python-service` tiene salida a Internet |
| Servicio Python | Endpoints `/v1/*` exigen `X-Internal-Token`; no es alcanzable desde el host |
| GitHub Actions | `permissions: contents: read` por defecto; escritura de paquetes solo en el job de publicación; acciones fijadas por SHA; secretos por ambiente |
| Aplicación | RBAC (`user`, `operator`, `admin`); el registro público nunca asigna roles elevados (`scripts/promote-user.sh` requiere acceso a la base de datos) |
