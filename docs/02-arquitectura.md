# 2. Arquitectura

> Modelo C4 (contexto → contenedores → componentes) + despliegue + flujos. Las decisiones se justifican en los [ADR](adr/README.md).
>
> **Cambios de la EP2:** ingesta programada en NestJS ([ADR-0013](adr/0013-ingesta-programada-sin-cola.md)), índice de búsqueda en PostgreSQL con tokens normalizados por Python ([ADR-0014](adr/0014-indice-busqueda-postgresql.md)), reporte de calidad de datos y métricas de la fuente, y despliegue automático en staging con rollback ([ADR-0015](adr/0015-despliegue-staging-rollback.md)) sobre una VM de Azure en Chile Central ([ADR-0017](adr/0017-staging-azure.md)), con imágenes multiarquitectura ([ADR-0016](adr/0016-staging-oracle-cloud-arm.md)). Flujo de la información web: §2.5.4 y [docs/10](10-recuperacion-y-evaluacion.md).

## 2.1 Vista general

```
Ionic + Angular + Capacitor  (navegador · PWA · Android)
                │  HTTPS / REST + JWT
                ▼
     API REST principal NestJS  ──────────────►  PostgreSQL 17
                │  REST interno + token de servicio
                ▼
      Servicio SmartMatch (Python + FastAPI) ──►  Open Food Facts / Open Prices (Web)
```

Reglas de la arquitectura (sección 3 del enunciado):

1. El frontend **solo** se comunica con NestJS. Nunca accede a Python ni a la base de datos.
2. NestJS es el **único dueño** de PostgreSQL (TypeORM + migraciones). Python **no** tiene credenciales de base de datos: recibe los datos que necesita en el contrato de cada solicitud.
3. Python es **sin estado**: obtiene información web, la normaliza y ejecuta el motor SmartMatch.
4. Cada componente corre en su **propio contenedor**, se comunica por **nombre de servicio** y se configura por **variables de entorno**.

## 2.2 Diagrama de contexto (C4 nivel 1)

```mermaid
flowchart LR
    visitante(["Visitante<br/>(sin cuenta)"])
    consumidor(["Consumidor registrado<br/>rol user"])
    operador(["Operador de datos<br/>rol operator"])
    admin(["Administrador<br/>rol admin"])

    subgraph sc["Sistema SmartCommerce"]
        app["SmartCommerce<br/>Recomienda y compara productos<br/>de forma personalizada y explicable"]
    end

    off[("Open Food Facts API<br/>productos, nutrición, NOVA,<br/>Eco-Score, alérgenos · ODbL")]
    op[("Open Prices API<br/>precios colaborativos · ODbL")]
    gh["GitHub + GitHub Actions<br/>código, pipeline DevSecOps"]
    stg["Host de staging<br/>(Docker, Terraform)"]

    visitante -->|"explora catálogo"| app
    consumidor -->|"preferencias, búsquedas,<br/>comparaciones, feedback"| app
    operador -->|"ejecuta ingestas"| app
    admin -->|"gestiona usuarios y<br/>revisa estado"| app
    app -->|"HTTPS GET (API oficial,<br/>User-Agent identificado)"| off
    app -->|"HTTPS GET"| op
    gh -->|"construye, verifica y despliega"| stg
    stg -.->|"ejecuta"| app
```

## 2.3 Diagrama de contenedores (C4 nivel 2)

```mermaid
flowchart TB
    user(["Usuario<br/>navegador · PWA · Android"])

    subgraph edge["Red edge (pública: único puerto publicado)"]
        fe["<b>frontend</b><br/>Angular 22 + Ionic 9 + Capacitor 8<br/>servido por Nginx sin privilegios :8080<br/>SPA · PWA (service worker)<br/>proxy /api → backend"]
    end

    subgraph internas["Redes internas (internal: true, sin salida a Internet)"]
        be["<b>backend</b><br/>NestJS 12 · Node 24 :3000<br/>API REST /api/v1 · Swagger /api/docs<br/>Auth JWT · RBAC · validación<br/>orquestación y fallback"]
        py["<b>python-service</b><br/>Python 3.13 · FastAPI :8000<br/>ingesta y normalización<br/>motor SmartMatch<br/>/v1/* protegido con token interno"]
        db[("<b>database</b><br/>PostgreSQL 17<br/>rol owner: migraciones<br/>rol app: solo DML")]
        mig["<b>migrate</b> (one-shot)<br/>TypeORM migrations"]
    end

    ext[("Open Food Facts<br/>Open Prices")]

    user -->|"HTTPS :8080"| fe
    fe -->|"red api · HTTP /api (proxy inverso)"| be
    be -->|"red data · SQL (TypeORM, pool)"| db
    mig -->|"red data · DDL (rol owner)"| db
    be -->|"red services · REST JSON + X-Internal-Token<br/>timeout 3–10 s · 2 reintentos"| py
    py -->|"red egress · HTTPS<br/>rate limit · caché"| ext
```

| Contenedor | Tecnología | Responsabilidad | Redes | Expone |
|---|---|---|---|---|
| `frontend` | Angular 22, Ionic 9, Capacitor 8, Nginx | UI multiplataforma, PWA, proxy `/api` | `edge`, `api` | `8080` (único puerto publicado) |
| `backend` | NestJS 12, TypeORM, Pino | API REST, autenticación/autorización, negocio, persistencia, coordinación con Python, salud | `api`, `services`, `data` | `3000` (solo redes internas) |
| `python-service` | FastAPI, Pydantic v2, httpx | Obtención y normalización de datos web, motor SmartMatch | `services`, `egress` | `8000` (solo red `services`) |
| `database` | PostgreSQL 17 | Persistencia relacional | `data` | `5432` (solo red `data`) |
| `migrate` | Imagen del backend | Ejecuta migraciones con rol propietario y termina | `data` | — |

La segmentación garantiza que cada contenedor alcance **solo** lo que necesita: el gateway no llega a Python ni a la base de datos, la API no tiene salida a Internet y solo el servicio Python consulta la fuente web. El pipeline lo verifica en cada ejecución con `scripts/network-isolation-test.sh`.

## 2.4 Componentes (C4 nivel 3)

### 2.4.1 Frontend (Angular + Ionic)

```mermaid
flowchart LR
    subgraph core["core/"]
        auth["AuthService (signals)<br/>TokenStorage (Capacitor Preferences)"]
        guards["authGuard · roleGuard · guestGuard"]
        inter["Interceptores:<br/>requestId → auth (Bearer + refresh) → error"]
        net["NetworkService<br/>(Capacitor Network)"]
        layout["LayoutService<br/>(breakpoints)"]
    end
    subgraph features["features/ (páginas standalone, lazy)"]
        welcome["welcome"] --- login["auth: login / register"]
        home["home: Para ti"] --- explore["explore"]
        detail["product-detail"] --- compare["compare"]
        profile["profile + preferencias"] --- admin["admin: ingesta / calidad de datos / estado"]
    end
    subgraph shared["shared/"]
        comps["match-ring · grade-badge · nutri-score<br/>high-in-seal · product-card · reason-chips"]
        models["models/ (contratos tipados)"]
    end
    api["services/ (HttpClient):<br/>products · recommendations · preferences<br/>interactions · admin · health"]

    features --> api
    features --> comps
    api --> inter
    guards --> auth
    inter --> auth
```

- Navegación: **pestañas inferiores en móvil** e **`ion-split-pane` con menú lateral en escritorio (≥ 992 px)**.
- Estado reactivo con **Signals** (sesión, preferencias, comparación en curso) y **RxJS** para HTTP.
- Formularios **reactivos** con validaciones sincrónicas.
- PWA: `@angular/service-worker`, manifiesto, íconos, caché de assets y de lecturas (`/api/v1/products`, recomendaciones) con estrategia *freshness*.

### 2.4.2 Backend NestJS

```mermaid
flowchart TB
    subgraph cross["Transversal (common/)"]
        rid["RequestIdMiddleware"]
        pino["Logger Pino (JSON, redacción de secretos)"]
        vp["ValidationPipe global<br/>(whitelist, forbidNonWhitelisted)"]
        ex["AllExceptionsFilter<br/>(errores consistentes sin trazas)"]
        jg["JwtAuthGuard global + @Public()"]
        rg["RolesGuard + @Roles()"]
        th["ThrottlerGuard (rate limit)"]
    end
    subgraph mods["Módulos"]
        authm["AuthModule<br/>register · login · refresh · logout · me"]
        usersm["UsersModule<br/>(admin) listar, cambiar rol"]
        prefm["PreferencesModule<br/>GET/PUT /me/preferences"]
        prodm["ProductsModule<br/>listado, búsqueda, detalle"]
        interm["InteractionsModule<br/>eventos de comportamiento"]
        recm["RecommendationsModule<br/>perfil + candidatos → SmartMatch<br/>fallback base si Python cae"]
        ingm["IngestionModule<br/>(admin/operator) ejecutar y listar ingestas"]
        pym["SmartMatchClientModule<br/>fetch + timeout + reintentos +<br/>circuit breaker + validación zod"]
        healthm["HealthModule (Terminus)<br/>DB · Python · memoria"]
    end
    db[("PostgreSQL")]
    py["FastAPI"]
    recm --> pym
    ingm --> pym
    healthm --> pym
    pym --> py
    authm & usersm & prefm & prodm & interm & recm & ingm --> db
```

### 2.4.3 Servicio Python (FastAPI)

```mermaid
flowchart LR
    api["routers/<br/>health · ingestion · products · recommendations"]
    sec["security.py<br/>verificación de X-Internal-Token<br/>(comparación en tiempo constante)"]
    subgraph domain["Dominio"]
        norm["normalization/<br/>validación · limpieza · unidades<br/>GTIN · sellos Ley 20.606 · dedupe"]
        eng["engine/<br/>SmartMatch: filtros · criterios ·<br/>ponderación · afinidad · explicación"]
    end
    subgraph adapters["Adaptadores"]
        off["sources/openfoodfacts.py<br/>httpx · timeout · reintentos ·<br/>rate limit · User-Agent"]
    end
    api --> sec
    api --> norm
    api --> eng
    api --> off
    off --> norm
```

## 2.5 Flujos principales

### 2.5.1 Recomendaciones personalizadas (Angular → NestJS → Python → NestJS → Angular)

```mermaid
sequenceDiagram
    autonumber
    participant A as Angular (Ionic)
    participant N as NestJS
    participant D as PostgreSQL
    participant P as FastAPI SmartMatch
    A->>N: GET /api/v1/recommendations?limit=10<br/>Authorization: Bearer JWT · X-Request-Id
    N->>N: JwtAuthGuard + RolesGuard(user)
    N->>D: preferencias, interacciones recientes, candidatos
    D-->>N: filas
    N->>N: calcula afinidades (decaimiento temporal)
    N->>P: POST /v1/recommendations/rank<br/>X-Internal-Token · X-Request-Id · timeout 5 s
    alt servicio disponible
        P-->>N: 200 items rankeados + desglose + razones
        N->>N: valida contrato (zod) y registra recommendation_log
        N-->>A: 200 {strategy:"personalized", degraded:false, items}
    else timeout / 5xx / circuito abierto
        N->>N: ranking base en TypeScript (calidad general)
        N-->>A: 200 {strategy:"baseline", degraded:true, notice}
    end
```

### 2.5.2 Ingesta desde la fuente web

```mermaid
sequenceDiagram
    autonumber
    participant A as Angular (admin/operator)
    participant N as NestJS
    participant P as FastAPI
    participant O as Open Food Facts API
    participant D as PostgreSQL
    A->>N: POST /api/v1/admin/ingestions {country, category, pageSize}
    N->>D: INSERT ingestion_runs (status=running)
    N->>P: POST /v1/ingestion/openfoodfacts/search
    P->>O: GET /api/v2/search?countries_tags_en=chile&...<br/>User-Agent: SmartCommerce/0.1 (contacto)
    O-->>P: productos crudos
    P->>P: valida → limpia → normaliza → deduplica → calcula sellos y calidad
    P-->>N: productos normalizados + reporte de calidad + procedencia
    N->>D: UPSERT products / product_sources (transacción)
    N->>D: UPDATE ingestion_runs (conteos, status=completed)
    N-->>A: 201 resumen de la ejecución
```

### 2.5.3 Autenticación

```mermaid
sequenceDiagram
    autonumber
    participant A as Angular
    participant N as NestJS
    participant D as PostgreSQL
    A->>N: POST /api/v1/auth/login {email, password}
    N->>D: busca usuario por email
    N->>N: argon2id.verify(hash, password)
    N->>D: guarda hash SHA-256 del refresh token (familia, expiración)
    N-->>A: accessToken (JWT 15 min) + refreshToken (opaco 7 días)
    Note over A: interceptor agrega Bearer; ante 401 usa /auth/refresh una vez
    A->>N: POST /api/v1/auth/refresh {refreshToken}
    N->>D: valida hash, revoca el anterior, emite uno nuevo (rotación)
    N-->>A: nuevos tokens
    A->>N: POST /api/v1/auth/logout {refreshToken}
    N->>D: revoca la familia de tokens
```

### 2.5.4 Información web: recuperación, preparación e indexación (EP2)

```mermaid
sequenceDiagram
    autonumber
    participant S as IngestionScheduler (NestJS)
    participant N as IngestionService (NestJS)
    participant P as FastAPI
    participant O as Open Food Facts
    participant D as PostgreSQL
    S->>D: pg_try_advisory_lock (un lote a la vez)
    loop cada objetivo país/categoría y página
        S->>N: start(trigger=scheduled, X-Request-Id=ingest-…)
        N->>D: INSERT ingestion_runs (running)
        N->>P: POST /v1/ingestion/openfoodfacts/search (token interno)
        P->>O: GET /api/v2/search (rate limit, reintentos, caché)
        O-->>P: registros crudos
        P->>P: validar · limpiar · normalizar · deduplicar · tokenizar
        P-->>N: productos normalizados + reporte de calidad
        N->>N: validar contrato (zod)
        N->>D: upsert products + product_sources (hash) en una transacción
        N->>D: UPDATE ingestion_runs (completed + métricas)
    end
    Note over P,O: Si la fuente falla → 502 SOURCE_UNAVAILABLE,<br/>ejecución failed, el lote sigue (partial)
    S->>D: pg_advisory_unlock
```

Consulta: `GET /api/v1/products?q=` → NestJS normaliza el texto con las mismas reglas que Python → `search_vector @@ to_tsquery('simple', …)` ordenado por `ts_rank_cd` → resultados con `relevance` y procedencia.

## 2.6 Despliegue

### 2.6.1 Local (Docker Compose)

```mermaid
flowchart LR
    dev(["Desarrollador<br/>127.0.0.1:8080"]) --> fe
    subgraph host["Docker host local (docker compose)"]
        fe["frontend :8080"]
        be["backend :3000"]
        py["python-service :8000"]
        db[("database :5432<br/>volumen smartcommerce-db-data")]
        mig["migrate (one-shot)"]
    end
    fe -->|"api (internal)"| be
    be -->|"services (internal)"| py
    be -->|"data (internal)"| db
    mig -->|"data (internal)"| db
    py -->|"egress"| internet[("Open Food Facts")]
```

Orden de arranque controlado con `depends_on` + `healthcheck`: `database (healthy)` → `migrate (completed)` + `python-service (healthy)` → `backend (healthy)` → `frontend`.

### 2.6.2 Staging (Azure)

```mermaid
flowchart LR
    gh["GitHub Actions<br/>quality gate verde en main"] -->|"push sha-commit<br/>manifiesto amd64 + arm64"| ghcr[("GHCR<br/>ghcr.io/dakotahh1/smartcommerce-*")]
    gh -->|"SSH (usuario deploy, solo llave)<br/>terraform apply · verificación · rollback"| docker
    subgraph vm["VM Azure Standard_B2als_v2 · Chile Central · 2 vCPU · 4 GB · Ubuntu 24.04"]
        caddy["Caddy :443<br/>TLS Let's Encrypt"]
        docker["Docker Engine"]
        tfres["Recursos Terraform (provider docker):<br/>redes edge/api/services/data/egress · volumen db ·<br/>frontend 127.0.0.1:8080 · backend · python · postgres"]
        caddy -->|"127.0.0.1:8080"| tfres
        docker --- tfres
    end
    ghcr -->|"pull variante amd64"| docker
    gh -->|"GET /api/health (versión exacta) + humo"| caddy
    users(["Docentes / testers"]) -->|"HTTPS<br/>57-156-69-73.sslip.io"| caddy
```

Solo Caddy queda expuesto (80 para validar el certificado y 443, permitidos en el Network Security Group de Azure junto con SSH); el gateway de la aplicación escucha en `127.0.0.1` y el resto de los contenedores no publica puertos. El host se prepara con [`infra/staging/bootstrap-host.sh`](../infra/staging/bootstrap-host.sh) y el estado de Terraform se guarda en la propia VM. Detalle en [09-staging-terraform.md](09-staging-terraform.md). Antes de publicar, el pipeline también levanta un **staging efímero** en el runner con las mismas imágenes escaneadas y ejecuta pruebas de salud, humo, integración, aislamiento y resiliencia.

## 2.7 Aspectos transversales

| Aspecto | Decisión |
|---|---|
| Configuración | Variables de entorno validadas al arrancar (Joi en NestJS, Pydantic Settings en Python); `.env.example` por servicio |
| Observabilidad | Logs JSON (Pino / structlog) con `requestId` propagado Angular → NestJS → Python; `/api/health` agregado; métricas de latencia por request |
| Errores | Formato uniforme `{statusCode, code, message, details, requestId, timestamp, path}` sin trazas internas |
| Seguridad | Helmet, CORS restringido, rate limiting, validación estricta, JWT corto + refresh rotativo, RBAC, token entre servicios, contenedores sin root, redes internas, mínimo privilegio en BD |
| Resiliencia | Timeouts, reintentos acotados con backoff, circuit breaker y respuesta degradada |
| Versionado de API | Prefijo `/api/v1` (URI versioning de NestJS) |
