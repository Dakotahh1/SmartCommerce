# API principal SmartCommerce (NestJS)

Punto único de acceso del frontend. Responsable de autenticación, autorización, validación, lógica de negocio, persistencia en PostgreSQL y coordinación con el servicio SmartMatch (Python).

- **Stack:** NestJS 12 (ESM) · Node 24 LTS · TypeORM 1.x · PostgreSQL 17 · Pino · Swagger · zod · Argon2id
- **Arquitectura:** [docs/02-arquitectura.md](../docs/02-arquitectura.md) · **Modelo de datos:** [docs/03-modelo-datos.md](../docs/03-modelo-datos.md) · **Seguridad:** [docs/06-seguridad-privacidad.md](../docs/06-seguridad-privacidad.md)

## Estructura

```
src/
├── main.ts / setup-app.ts        # bootstrap: prefijo /api, versión URI, Helmet, CORS, ValidationPipe, Swagger
├── app.module.ts                 # Config (zod), Pino, Throttler, TypeORM, guards/filtros/interceptores globales
├── config/env.schema.ts          # validación de variables de entorno (fail fast)
├── common/                       # guards JWT/roles, decoradores, filtro de errores, validación, métricas, paginación
├── database/                     # entidades, migraciones SQL, DataSource y CLI de migraciones
└── modules/
    ├── auth/                     # registro, login, refresh rotativo, logout, perfil, eliminación de cuenta
    ├── users/                    # administración de usuarios y roles (admin)
    ├── preferences/              # pesos, dietas, alérgenos, sellos, personalización
    ├── catalog/                  # productos, categorías, ingesta desde la fuente web (admin/operator)
    ├── interactions/             # eventos de comportamiento, favoritos, historial
    ├── recommendations/          # recomendaciones y comparaciones + ranking base de respaldo
    ├── smartmatch/               # cliente HTTP resiliente del servicio Python y contratos zod
    └── health/                   # /api/health, /api/health/live, /api/health/metrics
```

## Endpoints

Documentación interactiva: `GET /api/docs` (OpenAPI JSON en `/api/docs-json`) cuando `SWAGGER_ENABLED=true`.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Público · 10/min | Crea cuenta (rol `user`) y sesión |
| POST | `/api/v1/auth/login` | Público · 10/min | Inicia sesión |
| POST | `/api/v1/auth/refresh` | Público · 10/min | Rota el refresh token (reutilización ⇒ revoca la familia) |
| POST | `/api/v1/auth/logout` | Autenticado | Revoca la sesión |
| GET | `/api/v1/auth/me` | Autenticado | Perfil propio |
| DELETE | `/api/v1/auth/me` | Autenticado | Elimina cuenta y datos (requiere contraseña) |
| GET/PUT | `/api/v1/me/preferences` | Autenticado | Preferencias propias |
| GET | `/api/v1/products` | Público | Búsqueda (texto completo en español) y filtros: `q`, `category`, `nutriscore`, `maxNova`, `excludeAllergens`, `sort`, `page`, `limit` |
| GET | `/api/v1/products/:id` | Público | Detalle con nutrientes, dietas, procedencia e historial de precios |
| GET | `/api/v1/categories` | Público | Categorías con cantidad de productos |
| POST | `/api/v1/interactions` | Autenticado | Registra vista, favorito, comparación, descarte, etc. |
| GET/DELETE | `/api/v1/me/interactions` | Autenticado | Historial propio / restablecer aprendizaje |
| GET | `/api/v1/me/favorites` | Autenticado | Favoritos |
| GET | `/api/v1/recommendations` | Autenticado | Recomendaciones SmartMatch (`degraded: true` si se usó el respaldo) |
| POST | `/api/v1/comparisons` | Público (personalizada con sesión) | Compara 2–4 productos |
| GET/POST | `/api/v1/admin/ingestions` | `admin`, `operator` | Lista / ejecuta ingestas desde Open Food Facts |
| GET | `/api/v1/admin/users` | `admin` | Lista usuarios |
| PATCH | `/api/v1/admin/users/:id/role` | `admin` | Cambia rol |
| GET | `/api/health` | Público | `ok` · `degraded` (SmartMatch o fuente caídos) · `down` (sin BD → 503) |
| GET | `/api/health/live` | Público | Liveness del proceso |
| GET | `/api/health/metrics` | `admin`, `operator` | Conteo, errores 5xx, latencia promedio y p95 por ruta |

### Formato de error

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Datos inválidos",
  "details": [{ "field": "email", "message": "Ingresa un correo válido" }],
  "path": "/api/v1/auth/register",
  "timestamp": "2026-09-17T12:00:00.000Z",
  "requestId": "0b8f6c1e-…"
}
```

Nunca se incluyen trazas, consultas SQL ni mensajes internos. Cada respuesta incluye `X-Request-Id` (propagado a Python) y `X-Response-Time-Ms`.

## Integración con el servicio Python

`SmartMatchClient` (`src/modules/smartmatch`): `fetch` con `X-Internal-Token` y `X-Request-Id`, timeouts por operación, hasta 2 reintentos con backoff ante red/502/503/504/429, circuit breaker (5 fallos → abierto 30 s) y **validación zod** de cada respuesta. Si el motor falla, las recomendaciones y comparaciones responden con el **ranking base** en TypeScript (`degraded: true`) en lugar de un error. Ver [ADR-0008](../docs/adr/0008-comunicacion-interna-rest-resiliente.md).

## Desarrollo local

Requisitos: Node ≥ 24.15, PostgreSQL 17 y el servicio Python en ejecución.

```bash
cd backend
npm ci
cp .env.example .env            # completar secretos y conexión
npm run build
npm run migration:run           # usa DB_MIGRATION_USER/PASSWORD si existen
npm run start:dev               # http://localhost:3000/api/docs
```

## Calidad y pruebas

```bash
npm run lint             # oxlint (errores y advertencias bloquean)
npm run format:check     # prettier
npm run typecheck        # tsc --noEmit
npm test                 # pruebas unitarias (Vitest)
npm run test:cov         # con cobertura
npm run test:e2e         # integración con PostgreSQL real (variables DB_*)
npm audit --omit=dev --audit-level=critical
```

| Suite | Qué verifica |
|---|---|
| Unitarias (47) | Guards JWT/roles (token expirado, falsificado, audiencia, rol desconocido, 403), filtro de errores sin fugas, validación de DTO (campos extra, rol auto-asignado, pesos fuera de rango), variables de entorno, Argon2id, circuit breaker, cliente SmartMatch contra servidor HTTP simulado (contrato, reintentos, timeout, 4xx, circuito abierto, red caída), ranking base y modo degradado |
| E2E (8) | Migraciones `up → down → up`; registro, login, rotación y reutilización de refresh token, logout; RBAC; ingesta idempotente (insertados/sin cambios/fuente caída); catálogo con búsqueda, filtros y procedencia; flujo NestJS → Python → NestJS con preferencias e historial; degradación con Python caído; eliminación de cuenta; OpenAPI; métricas |

## Docker

```bash
docker build -t smartcommerce-backend .
```

Multi-etapa: compila con dependencias de desarrollo y ejecuta solo con dependencias de producción, sin npm en runtime, como usuario `node` (no root) y con `HEALTHCHECK` sobre `/api/health/live`. Las migraciones se ejecutan con la misma imagen: `node dist/database/migrate.js run`.
