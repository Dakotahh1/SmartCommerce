# SmartCommerce

[![CI DevSecOps](https://github.com/Dakotahh1/SmartCommerce/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Dakotahh1/SmartCommerce/actions/workflows/ci.yml)

> Plataforma **web, PWA y Android** que recomienda y compara productos de supermercado de forma **personalizada y explicable**, combinando calidad nutricional, procesamiento, impacto ambiental, precio, disponibilidad y preferencias con datos abiertos de **Open Food Facts**.

Proyecto de la asignatura **Ingeniería Web Avanzada** — Ingeniería Civil Informática · Área de aplicación: **comercio y servicios**.
**Entrega actual:** Entrega Parcial 2 — *Información web, procesamiento e integración del servicio Python* (`v0.2.0-ep2`). Entrega anterior: EP1 `v0.1.1-ep1`. Qué se hizo en la EP2 y cómo: [docs/EP2-registro-de-trabajo.md](docs/EP2-registro-de-trabajo.md).

| Enlace | |
|---|---|
| 🎨 Prototipo navegable y design system | [Figma · SmartCommerce](https://www.figma.com/design/vUBipEZdpxUtfokgU17hKu) |
| ⚙️ Pipeline | [GitHub Actions](https://github.com/Dakotahh1/SmartCommerce/actions/workflows/ci.yml) |
| 📋 Tablero de gestión | [Trello · Kanban Board](https://trello.com/invite/b/6ab9e79ba3760eb1cc5d619d/ATTI6a53b4a4926cc415196729043f0e1f74E5264F6E/kanban-smartcommerce)|
| 🌐 Ambiente desplegado | Staging desplegado automáticamente desde `main` por el job `deploy-staging` (URL en *Environments › staging* del repositorio; `/api/health` informa versión y commit) · staging efímero en cada PR ([docs/09](docs/09-staging-terraform.md)) |

---

## Contenido

1. [Problema y propuesta](#1-problema-y-propuesta)
2. [Equipo](#2-equipo)
3. [Arquitectura](#3-arquitectura)
4. [Estructura del repositorio](#4-estructura-del-repositorio)
5. [Instalación y ejecución con Docker Compose](#5-instalación-y-ejecución-con-docker-compose)
6. [Desarrollo por componente](#6-desarrollo-por-componente)
7. [Pipeline DevSecOps](#7-pipeline-devsecops)
8. [Variables de entorno y secretos](#8-variables-de-entorno-y-secretos)
9. [API](#9-api)
10. [Infraestructura y staging](#10-infraestructura-y-staging)
11. [Pruebas](#11-pruebas)
12. [Guía de demostración (EP1 y EP2)](#12-guía-de-demostración-ep1-y-ep2)
13. [Limitaciones y trabajo futuro](#13-limitaciones-y-trabajo-futuro)
14. [Documentación](#14-documentación)

---

## 1. Problema y propuesta

Comparar productos **solo por precio** es insuficiente: para elegir en el supermercado una persona debe equilibrar características, calidad nutricional (Nutri-Score, sellos **ALTO EN** de la Ley 20.606), nivel de procesamiento, impacto ambiental, precio por kilo, disponibilidad y sus propias restricciones (alérgenos, dietas). Esa información está **dispersa**, usa unidades distintas y no está personalizada.

**Problema delimitado.** Recomendar y comparar productos envasados de supermercado disponibles en Chile según las preferencias explícitas del consumidor (pesos por criterio), sus restricciones y su historial de interacción, con información obtenida y normalizada desde **Open Food Facts** y **Open Prices**, entregando una explicación verificable de cada recomendación.

| Usuarios | Necesidad |
|---|---|
| Visitante | Explorar el catálogo y comparar con puntajes generales |
| Consumidor (`user`) | Recomendaciones y comparaciones personalizadas y explicadas en segundos |
| Operador de datos (`operator`) | Ejecutar y auditar ingestas desde la fuente web |
| Administrador (`admin`) | Gestionar roles y supervisar el estado del sistema |

**Capacidad inteligente — motor SmartMatch** ([docs/05](docs/05-motor-smartmatch.md)):
1. *Filtros duros*: alérgenos excluidos, dietas y sellos ALTO EN.
2. *Puntaje multicriterio* 0–100 (nutrición, precio relativo a la categoría, procesamiento NOVA, Eco-Score, disponibilidad) con renormalización ante datos faltantes y confianza según cobertura.
3. *Adaptación*: ajustes acotados de pesos y afinidades aprendidos de favoritos, comparaciones y descartes, con decaimiento temporal; el usuario puede **desactivarla o restablecerla**.
4. *Explicación*: desglose por criterio, razones y advertencias; *estrategia base* no adaptativa para evaluar la mejora.

**Información web (EP2)** ([docs/10](docs/10-recuperacion-y-evaluacion.md)): ingesta **automatizada y programada** desde Open Food Facts (Chile) → validación, limpieza, normalización, deduplicación y tokenización en Python → persistencia con **procedencia** (fuente, licencia, URL, hash y fecha) e **índice de búsqueda** en PostgreSQL → buscador con **ranking por relevancia** y panel de **calidad de datos** con alertas. Evaluación reproducible: datos reales 95 % válidos y 0 % duplicados; buscador **P@5 0,70 · MRR 1,00 · nDCG@5 0,93** (orden base de la EP1: 0,62 · 0,93 · 0,84).

Detalle completo: [docs/01 · Definición del proyecto](docs/01-definicion-proyecto.md) · [docs/04 · Fuente web](docs/04-fuente-web.md) · [docs/10 · Recuperación y evaluación](docs/10-recuperacion-y-evaluacion.md).

## 2. Equipo

| Integrante | Rol principal | Responsabilidades |
|---|---|---|
| Diego Alvarado | Frontend y UX | Angular + Ionic + Capacitor, prototipo Figma, accesibilidad |
| Vicente Palma | Backend y DevSecOps | NestJS, autenticación, API REST, PostgreSQL y migraciones; Docker, pipeline de GitHub Actions, Terraform y seguridad |
| Lucas Pinto | Datos e inteligencia | Servicio Python, fuente web, motor SmartMatch |


El trabajo se organiza con **GitHub Flow**: ramas cortas por área, pull requests hacia `main` con plantilla y el check `Quality gate` obligatorio ([CONTRIBUTING.md](CONTRIBUTING.md), [ADR-0011](docs/adr/0011-estrategia-de-ramas-github-flow.md)).

## 3. Arquitectura

```mermaid
flowchart LR
    user(["Usuario<br/>navegador · PWA · Android"]) -->|HTTPS| fe
    subgraph compose["Docker Compose / host de staging"]
        fe["frontend<br/>Angular 22 + Ionic 9<br/>Nginx :8080"]
        be["backend<br/>NestJS 12 :3000"]
        py["python-service<br/>FastAPI :8000<br/>SmartMatch"]
        db[("database<br/>PostgreSQL 17")]
        mig["migrate<br/>(one-shot)"]
    end
    fe -->|"red api · /api (proxy)"| be
    be -->|"red services · REST + token interno"| py
    be -->|"red data · SQL"| db
    mig -->|"red data · DDL"| db
    py -->|"red egress · HTTPS"| off[("Open Food Facts<br/>Open Prices")]
```

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| `frontend` | Angular 22 (standalone, signals, zoneless) · Ionic 9 · Capacitor 8 · Nginx | UI web/PWA/Android, navegación adaptable, sesión segura, modo sin conexión, gateway `/api` con CSP |
| `backend` | NestJS 12 · TypeORM · PostgreSQL 17 · Pino · Swagger | Punto único de acceso: autenticación JWT + refresh rotativo, RBAC, validación DTO, negocio, persistencia, coordinación resiliente con Python |
| `python-service` | Python 3.13 · FastAPI · Pydantic v2 · httpx | Obtención, validación y normalización de datos web; motor SmartMatch; métricas de calidad |
| `database` | PostgreSQL 17 | Usuarios, preferencias, catálogo normalizado, procedencia, interacciones y registros de recomendación |

**Flujo de la información web (EP2):** el programador de NestJS (o un operador) solicita `POST /v1/ingestion/openfoodfacts/search` a FastAPI → Python consulta Open Food Facts respetando sus límites, valida, normaliza, deduplica y tokeniza → NestJS valida el contrato, hace *upsert* idempotente con procedencia y registra la ejecución → `GET /api/v1/products?q=` busca en el índice `search_vector` y ordena por relevancia; `GET /api/v1/admin/data-quality` evalúa los datos.

**Flujo principal (recomendaciones):** la app solicita `GET /api/v1/recommendations` → NestJS valida el JWT, lee preferencias, historial y candidatos de PostgreSQL → llama a `POST /v1/recommendations/rank` en FastAPI (timeout, reintentos, circuit breaker, contrato validado con zod) → guarda el registro de recomendación → responde con puntajes y explicaciones. Si Python no está disponible, NestJS responde con un **ranking base de respaldo** marcado `degraded: true`.

Diagramas C4, despliegue y secuencias: [docs/02 · Arquitectura](docs/02-arquitectura.md) · Modelo de datos: [docs/03](docs/03-modelo-datos.md) · Decisiones: [ADR](docs/adr/README.md).

## 4. Estructura del repositorio

```
SmartCommerce/
├── frontend/                 # Angular + Ionic + Capacitor (PWA y proyecto Android) · Dockerfile Nginx
├── backend/                  # NestJS: módulos, entidades, migraciones, pruebas unitarias y e2e · Dockerfile
├── python-service/           # FastAPI: fuente web, normalización, motor SmartMatch, pruebas · Dockerfile
├── infra/
│   ├── docker/postgres/init/ # roles de mínimo privilegio para PostgreSQL
│   └── terraform/            # módulo del stack + ambientes dev y staging
├── scripts/                  # init-env, smoke-test, network-isolation-test, resilience-test, promote-user
├── docs/                     # definición, arquitectura, datos, fuente web, motor, seguridad, pipeline, variables, staging, ADR
├── .github/                  # workflow CI DevSecOps, Dependabot, plantilla de PR
├── docker-compose.yml        # ambiente local integrado
└── .env.example              # variables para Docker Compose (sin secretos reales)
```

## 5. Instalación y ejecución con Docker Compose

**Requisitos:** Docker Engine 24+ con Docker Compose v2 (Docker Desktop en Windows/macOS), Git y Bash (Git Bash en Windows). Conexión a Internet para la ingesta desde Open Food Facts.

```bash
git clone https://github.com/Dakotahh1/SmartCommerce.git
cd SmartCommerce

# 1. Variables: crea .env con secretos aleatorios (nunca se versiona)
scripts/init-env.sh

# 2. Construir y levantar todo (database → migrate → python-service → backend → frontend)
docker compose up -d --build
docker compose ps            # todos "healthy"; migrate "exited (0)"

# 3. Abrir la aplicación
#    App:      http://localhost:8080
#    Swagger:  http://localhost:8080/api/docs
#    Salud:    http://localhost:8080/api/health
```

**Poblar el catálogo** (la ingesta está restringida a `admin`/`operator`):

```bash
# a) Registrarse en la app (http://localhost:8080/auth/registro) y promover la cuenta:
scripts/promote-user.sh tu@correo.cl admin
# b) Cerrar sesión y volver a entrar (el rol viaja en el token), luego ir a Administración › Ingesta
#    y ejecutar, por ejemplo: país "chile", categoría "breakfast-cereals", 50 productos.
```

**Verificación automática del stack local:**

```bash
scripts/smoke-test.sh                 # flujo mínimo + controles de seguridad
scripts/network-isolation-test.sh     # segmentación de red
scripts/resilience-test.sh            # fallo controlado de Python y PostgreSQL
```

**Detener:** `docker compose down` (conserva datos) · `docker compose down -v` (borra el volumen).

| Servicio | Puerto | Expuesto al host | Redes |
|---|---|---|---|
| frontend | 8080 | Sí (solo `127.0.0.1` por defecto) | `edge`, `api` |
| backend | 3000 | No | `api`, `services`, `data` |
| python-service | 8000 | No | `services`, `egress` |
| database | 5432 | No | `data` |

## 6. Desarrollo por componente

| Componente | Requisitos | Comandos |
|---|---|---|
| Frontend | Node 24 LTS, npm 11 | `cd frontend && npm ci && npm start` → http://localhost:4200 (API en `http://localhost:3000/api`) |
| Backend | Node 24 LTS, PostgreSQL 17 | `cd backend && npm ci && cp .env.example .env` (completar) `&& npm run build && npm run migration:run && npm run start:dev` |
| Python | Python 3.13, [uv](https://docs.astral.sh/uv/) | `cd python-service && uv sync && cp .env.example .env && uv run --env-file .env uvicorn --factory app.main:create_app --reload --port 8000` |
| Android | Android Studio (SDK 36), JDK 21 | `cd frontend && npm run build:android && npx cap open android` |

Guías específicas: [frontend/README.md](frontend/README.md) · [backend/README.md](backend/README.md) · [python-service/README.md](python-service/README.md).

## 7. Pipeline DevSecOps

Workflow [`ci.yml`](.github/workflows/ci.yml) en cada pull request y push a `main`. Cada etapa depende de la anterior y un **quality gate** único bloquea la integración si algo falla.

| Etapa | Controles | Bloquea si… |
|---|---|---|
| 1. Seguridad del repositorio | **gitleaks** (historial completo) · **Semgrep** (OWASP, TS, Python, Docker, Actions) · **hadolint** · **ShellCheck** · **actionlint** · `docker compose config` | Secreto, hallazgo SAST alto o configuración inválida |
| 2. Componentes | `npm ci` / `uv sync --frozen` · ESLint/oxlint/Ruff · Prettier/Ruff format · `tsc`/mypy estricto · Vitest/pytest con cobertura · build · e2e con PostgreSQL real · **evaluación del buscador (P@5, MRR, nDCG)** · **npm audit** · **pip-audit** · **Bandit** · APK Android | Error de lint, tipos, pruebas, build o dependencia vulnerable (alta/crítica) |
| 3. Contenedores | Build de las 3 imágenes · verificación de usuario no root · **Trivy** · SBOM CycloneDX | Imagen root o vulnerabilidad CRITICAL/HIGH con parche |
| 4. Staging efímero | Docker Compose con las imágenes escaneadas y fuente simulada · humo (incl. 401/403/400) · **integración EP2** (fuente → Python → NestJS → PostgreSQL → consulta, caída de la fuente) · aislamiento de red · resiliencia | Cualquier prueba falla |
| 4. Terraform | `fmt` · `validate` (dev y staging) · `plan` de staging | Formato, validación o plan inválidos |
| 5. Quality gate | Resume todas las etapas | Alguna etapa no terminó en éxito |
| 6. Publicación | Imágenes en GHCR (`sha-<commit>`, `main`, versión) | Solo en `main`/tags tras el gate |
| 7. Despliegue en staging | `terraform apply` de `sha-<commit>` · salud con la versión exacta · humo en la URL pública · **rollback automático** | Verificación fallida (se revierte a la versión anterior) |

Seguridad del pipeline: permisos `contents: read` por defecto, acciones fijadas por SHA, binarios con SHA-256 verificado, secretos por ambiente enmascarados y Dependabot. Detalle, evidencias de bloqueo y protección de `main`: [docs/07 · Pipeline DevSecOps](docs/07-pipeline-devsecops.md).

## 8. Variables de entorno y secretos

| Dónde | No sensibles | Sensibles |
|---|---|---|
| Local / Compose | `.env` (desde [`.env.example`](.env.example)) | `.env` (ignorado por git; `scripts/init-env.sh` genera valores aleatorios) |
| GitHub Actions | **Variables**: `APP_VERSION`, `OFF_USER_AGENT`, `SMOKE_INGEST`, `TRIVY_SEVERITY`, `STAGING_DOCKER_HOST`, `STAGING_URL`, `STAGING_SSH_KNOWN_HOSTS` (huella pública del host) | **Secrets** (ambiente `staging`): `POSTGRES_SUPERUSER_PASSWORD`, `DB_OWNER_PASSWORD`, `DB_APP_PASSWORD`, `JWT_ACCESS_SECRET`, `INTERNAL_API_TOKEN`, `STAGING_SSH_PRIVATE_KEY` |
| Terraform | `environments/<ambiente>/terraform.tfvars` | `TF_VAR_*` |

Variables requeridas por Docker Compose:

| Variable | Tipo | Descripción |
|---|---|---|
| `POSTGRES_SUPERUSER_PASSWORD` | Secreto | Solo para inicializar PostgreSQL |
| `DB_OWNER_PASSWORD` | Secreto | Rol dueño del esquema (migraciones) |
| `DB_APP_PASSWORD` | Secreto | Rol de la API (solo DML) |
| `JWT_ACCESS_SECRET` | Secreto (≥ 32) | Firma de access tokens |
| `INTERNAL_API_TOKEN` | Secreto (≥ 32) | Autenticación NestJS → FastAPI |
| `APP_ENV`, `APP_VERSION`, `LOG_LEVEL` | Variable | Ambiente, versión y logs |
| `FRONTEND_BIND`, `FRONTEND_PORT`, `CORS_ORIGINS` | Variable | Exposición del gateway y orígenes permitidos |
| `OFF_USER_AGENT`, `OFF_*` | Variable | Identificación y límites hacia Open Food Facts |
| `INGESTION_SCHEDULE_ENABLED`, `INGESTION_*` | Variable | Ingesta programada: activación, intervalo, objetivos `pais/categoria` y páginas |
| `DATA_STALE_AFTER_DAYS` | Variable | Umbral de actualidad del reporte de calidad |

Tabla completa, mínimo privilegio y configuración paso a paso en GitHub: [docs/08 · Variables y secretos](docs/08-variables-y-secretos.md).

## 9. API

Documentación interactiva **OpenAPI/Swagger**: `http://localhost:8080/api/docs` (JSON en `/api/docs-json`). Sin levantar nada, las especificaciones de ambas APIs están versionadas en [docs/api](docs/api/README.md) y el pipeline falla si dejan de coincidir con el código.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/v1/auth/register` · `/login` · `/refresh` | Público (rate limit) | Registro, inicio de sesión y rotación de refresh token |
| POST · GET · DELETE | `/api/v1/auth/logout` · `/me` | Autenticado | Cierre de sesión, perfil y eliminación de cuenta |
| GET · PUT | `/api/v1/me/preferences` | Autenticado | Preferencias de personalización |
| GET | `/api/v1/products` · `/products/:id` · `/categories` | Público | Catálogo con búsqueda por relevancia (`relevance`), filtros y procedencia |
| POST · GET · DELETE | `/api/v1/interactions` · `/me/interactions` · `/me/favorites` | Autenticado | Comportamiento, historial y aprendizaje |
| GET | `/api/v1/recommendations` | Autenticado | Recomendaciones SmartMatch explicables |
| POST | `/api/v1/comparisons` | Público (personalizada con sesión) | Comparación de 2–4 productos |
| GET · POST | `/api/v1/admin/ingestions` | `admin`, `operator` | Ingestas desde Open Food Facts con reporte de calidad |
| GET · POST | `/api/v1/admin/ingestions/schedule` · `/schedule/run` | `admin`, `operator` | Estado de la ingesta programada y ejecución inmediata de un lote (202, asíncrono) |
| GET | `/api/v1/admin/data-quality?days=` | `admin`, `operator` | Calidad de la información recuperada: validez, duplicados, cobertura, actualidad, errores, tiempos y alertas |
| GET · PATCH | `/api/v1/admin/users` | `admin` | Gestión de roles |
| GET | `/api/health` · `/api/health/live` · `/api/health/metrics` | Público / `admin`,`operator` | Salud agregada y métricas por ruta |

Servicio Python (interno; documentación interactiva en `/docs` de FastAPI fuera de producción): `POST /v1/ingestion/openfoodfacts/search`, `POST /v1/products/normalize`, `POST /v1/recommendations/rank`, `POST /v1/comparisons`, `POST /v1/profiles/learn`, `GET /v1/metrics` (incluye métricas de la fuente), `GET /health`, `GET /health/ready`.

Errores con formato uniforme `{ statusCode, code, message, details, path, timestamp, requestId }` y correlación extremo a extremo con `X-Request-Id`. Contratos internos del servicio Python: [python-service/README.md](python-service/README.md).

## 10. Infraestructura y staging

- **Terraform** con proveedor `kreuzwerker/docker` ([ADR-0010](docs/adr/0010-terraform-proveedor-docker-staging.md)): módulo `smartcommerce-stack` (redes segmentadas, volumen, imágenes y contenedores endurecidos) y ambientes `dev` y `staging` con variables, salidas y estado fuera del repositorio.
- `terraform fmt`, `validate` y `plan` se ejecutan en el pipeline.
- **Despliegue automático (EP2):** en cada push a `main` que pasa el quality gate, el job `deploy-staging` aplica la imagen `sha-<commit>`, verifica `/api/health` (versión `APP_VERSION+sha-<commit>`), ejecuta las pruebas de humo contra la URL pública y **revierte automáticamente** a la versión anterior si algo falla. Rollback manual: *Actions › Rollback staging*. Estado de Terraform fuera del repositorio ([ADR-0015](docs/adr/0015-despliegue-staging-rollback.md)).
- **Staging:** VM *Always Free* de **Oracle Cloud** en Santiago (Ampere ARM64, 2 OCPU, 12 GB, Ubuntu 24.04) preparada con [`infra/staging/bootstrap-oracle.sh`](infra/staging/bootstrap-oracle.sh): Docker, usuario `deploy` solo con llave, firewall y **Caddy** con HTTPS automático en `https://<ip-con-guiones>.sslip.io`. Las imágenes de GHCR se publican para amd64 y arm64 ([ADR-0016](docs/adr/0016-staging-oracle-cloud-arm.md)).

```bash
cd infra/terraform/environments/staging
terraform init && terraform validate
terraform plan -var "image_tag=sha-<commit>"      # requiere TF_VAR_* con los secretos
```

Detalle: [docs/09 · Infraestructura y staging](docs/09-staging-terraform.md).

## 11. Pruebas

| Componente | Herramientas | Alcance |
|---|---|---|
| Frontend | Vitest + TestBed | Sesión y refresh, interceptores, guards, formulario de login, contratos HTTP, store de comparación, componentes |
| Backend | Vitest (unitarias) + e2e con PostgreSQL real | Auth y rotación de tokens, RBAC, validación, cliente resiliente de SmartMatch, migraciones up/down, flujo HTTP completo con servicio Python simulado, ingesta programada, reporte de calidad, normalización de consultas (paridad con Python) y **evaluación del buscador** (P@5, MRR, nDCG) |
| Python | pytest + respx (cobertura ≥ 85 %) | Conector Open Food Facts (errores, reintentos y métricas de la fuente), normalización y calidad, tokenización, sellos Ley 20.606, motor y explicaciones, API y errores |
| Integración | `scripts/*.sh` en el staging efímero | Flujo mínimo, controles de seguridad, **integración EP2 con la fuente simulada** (`integration-test.sh`), aislamiento de red y resiliencia |

## 12. Guía de demostración (EP1 y EP2)

**EP1**

1. **Componentes corriendo:** `docker compose up -d --build` y `docker compose ps` (todos *healthy*).
2. **Navegación:** abrir http://localhost:8080 → bienvenida → explorar → detalle → comparar; en escritorio se ve el menú lateral y en móvil (DevTools) la barra inferior.
3. **Angular → NestJS:** iniciar sesión y abrir *Para ti*; en DevTools › Network se ve `GET /api/v1/recommendations` con `X-Request-Id`.
4. **NestJS → FastAPI:** `http://localhost:8080/api/health` muestra `smartmatch: up`; la ingesta desde *Administración* pasa por Python hasta Open Food Facts.
5. **NestJS ↔ PostgreSQL:** los productos ingeridos aparecen en *Explorar*; `docker compose exec database psql -U postgres -d smartcommerce -c "select count(*) from products"`.
6. **Pipeline en GitHub Actions:** mostrar la última ejecución con el resumen del quality gate, reportes de Trivy/Semgrep y el APK como artefacto.
7. **Fallo controlado:**
   - `docker compose stop python-service` → *Para ti* muestra el aviso de modo degradado y recomendaciones de respaldo; `docker compose start python-service` lo recupera.
   - Abrir un PR con un secreto ficticio o una prueba rota: el pipeline se detiene y el quality gate impide integrar ([docs/07 §7.5](docs/07-pipeline-devsecops.md#75-evidencia-de-bloqueo)).

**EP2** (fuente web → Python → NestJS → PostgreSQL → Angular):

1. **Recuperación automatizada:** con `INGESTION_SCHEDULE_ENABLED=true` en `.env` (así viene en `.env.example`) el primer lote corre un minuto después de arrancar; también *Administración › Ingesta de datos › Ejecutar lote ahora*. La tarjeta *Ingesta programada* muestra el resultado por categoría.
2. **Validación y preparación:** tabla de ejecuciones (válidos, rechazados, nuevos, sin cambios) y cobertura de campos; repetir la ingesta muestra 0 nuevos (deduplicación por hash).
3. **FastAPI y correlación:** `docker compose logs backend python-service | grep ingest-` muestra el mismo `X-Request-Id` en ambos servicios.
4. **Persistencia e índice:** `docker compose exec database psql -U postgres -d smartcommerce -c "select gtin, name, search_primary from products limit 5"`.
5. **Consulta y visualización:** *Explorar* → "sin azúcar" o "avena" (orden por relevancia) → detalle con procedencia y licencia.
6. **Métricas:** *Administración › Calidad de datos* (validez, duplicados, actualidad, errores y alertas) y la tabla P@5/MRR/nDCG en el resumen del job *Backend*.
7. **Error o indisponibilidad:** `docker compose stop python-service` (modo degradado) o sin Internet al ejecutar un lote → ejecución `failed`/`partial`, alerta en *Calidad de datos* y catálogo disponible.
8. **Staging:** URL del ambiente `staging` y `…/api/health` (versión `0.2.0+sha-<commit>`).

## 13. Limitaciones y trabajo futuro

**Limitaciones actuales (EP2)**
- Precios de Open Prices aún no integrados (cobertura en Chile casi nula): el criterio de precio se omite y se renormaliza. Cobertura medida de tiendas 13 % y NOVA 58 %.
- El buscador no corrige errores ortográficos ni traduce sinónimos (`protein`/`proteína`, `Quajer`/`Quaker`); su evaluación usa un corpus pequeño de una categoría y juicios de un solo equipo.
- La ingesta programada vive en el proceso de NestJS: un reinicio a mitad de lote lo repite en el siguiente intervalo (es idempotente).
- El staging es una sola VM gratuita: sin alta disponibilidad, y el estado de Terraform y la base de datos viven en ella (sin respaldo programado todavía).
- La adaptación usa reglas acotadas y transparentes; aún no hay evaluación experimental con usuarios. Sin iOS ni notificaciones push; la PWA cachea solo lecturas.

**Trabajo futuro**
- Precios de Open Prices, sinónimos y tolerancia a errores en el buscador, trazas distribuidas, pruebas E2E de interfaz, respaldo programado de PostgreSQL.
- Entrega final: evaluación del motor (Precision@5 personalizada vs. base), pruebas de usabilidad y accesibilidad WCAG AA, publicación del APK firmado.

## 14. Documentación

| Documento | Contenido |
|---|---|
| [01 · Definición del proyecto](docs/01-definicion-proyecto.md) | Problema, usuarios, objetivos, alcance, funcionalidades |
| [02 · Arquitectura](docs/02-arquitectura.md) | Diagramas C4, despliegue y flujos |
| [03 · Modelo de datos](docs/03-modelo-datos.md) | Modelo conceptual y lógico, migraciones, roles de BD |
| [04 · Fuente web](docs/04-fuente-web.md) | Open Food Facts / Open Prices: obtención, calidad, licencias |
| [05 · Motor SmartMatch](docs/05-motor-smartmatch.md) | Capacidad adaptativa y plan de evaluación |
| [06 · Seguridad y privacidad](docs/06-seguridad-privacidad.md) | RBAC, STRIDE, privacidad, controles automáticos |
| [07 · Pipeline DevSecOps](docs/07-pipeline-devsecops.md) | Etapas, quality gates, evidencias de bloqueo |
| [08 · Variables y secretos](docs/08-variables-y-secretos.md) | Configuración por ambiente y mínimo privilegio |
| [09 · Infraestructura y staging](docs/09-staging-terraform.md) | Terraform, ambiente de staging, despliegue y rollback |
| [10 · Recuperación y evaluación](docs/10-recuperacion-y-evaluacion.md) | Extracción, limpieza, indexación, buscador y métricas (EP2) |
| [Registro EP2](docs/EP2-registro-de-trabajo.md) | Verificación de la EP1, lista de comprobación de la EP2, qué se hizo y cómo, pendientes |
| [ADR](docs/adr/README.md) | Registro de decisiones de arquitectura |
| [CONTRIBUTING](CONTRIBUTING.md) | Flujo de ramas, commits y pull requests |

---

Datos de productos © colaboradores de Open Food Facts, bajo licencia [ODbL](https://opendatacommons.org/licenses/odbl/1-0/); imágenes bajo CC BY-SA. Código bajo licencia [MIT](LICENSE).
