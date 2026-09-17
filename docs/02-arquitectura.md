# 2. Arquitectura

> Modelo C4 (contexto → contenedores → componentes) + despliegue + flujos. Las decisiones se justifican en los [ADR](adr/README.md).

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

    subgraph edge["Red edge"]
        fe["<b>frontend</b><br/>Angular 22 + Ionic 9 + Capacitor 8<br/>servido por Nginx sin privilegios :8080<br/>SPA · PWA (service worker)<br/>proxy /api → backend"]
    end

    subgraph services["Red services (internal)"]
        be["<b>backend</b><br/>NestJS 12 · Node 22 :3000<br/>API REST /api/v1 · Swagger /api/docs<br/>Auth JWT · RBAC · validación<br/>orquestación y fallback"]
        py["<b>python-service</b><br/>Python 3.13 · FastAPI :8000<br/>ingesta y normalización<br/>motor SmartMatch<br/>/v1/* protegido con token interno"]
    end

    subgraph data["Red data (internal)"]
        db[("<b>database</b><br/>PostgreSQL 17<br/>rol owner: migraciones<br/>rol app: solo DML")]
        mig["<b>migrate</b> (one-shot)<br/>TypeORM migrations"]
    end

    ext[("Open Food Facts<br/>Open Prices")]

    user -->|"HTTPS :8080"| fe
    fe -->|"HTTP /api (proxy inverso)"| be
    be -->|"SQL (TypeORM, pool)"| db
    mig -->|"DDL (rol owner)"| db
    be -->|"REST JSON + X-Internal-Token<br/>timeout 3–10 s · 2 reintentos"| py
    py -->|"HTTPS · red egress<br/>rate limit · caché"| ext
```

| Contenedor | Tecnología | Responsabilidad | Expone |
|---|---|---|---|
| `frontend` | Angular 22, Ionic 9, Capacitor 8, Nginx | UI multiplataforma, PWA, proxy `/api` | `8080` (único puerto público) |
| `backend` | NestJS 12, TypeORM, Pino, Terminus | API REST, autenticación/autorización, negocio, persistencia, coordinación con Python, salud | `3000` (solo redes internas) |
| `python-service` | FastAPI, Pydantic v2, httpx | Obtención y normalización de datos web, motor SmartMatch | `8000` (solo red `services`) |
| `database` | PostgreSQL 17 | Persistencia relacional | `5432` (solo red `data`) |
| `migrate` | Imagen del backend | Ejecuta migraciones con rol propietario y termina | — |

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
        profile["profile + preferencias"] --- admin["admin: ingesta / estado"]
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

## 2.6 Despliegue

### 2.6.1 Local (Docker Compose)

```mermaid
flowchart LR
    dev(["Desarrollador<br/>localhost:8080"]) --> fe
    subgraph host["Docker host local"]
        subgraph edge["edge"]
            fe["frontend :8080"]
        end
        subgraph services["services (internal)"]
            be["backend :3000"]
            py["python-service :8000"]
        end
        subgraph data["data (internal)"]
            db[("database :5432<br/>volumen db-data")]
            mig["migrate (one-shot)"]
        end
        egress["egress (salida a Internet)"]
    end
    fe --> be
    be --> py
    be --> db
    mig --> db
    py --- egress
    egress --> internet[("Open Food Facts")]
```

Orden de arranque controlado con `depends_on` + `healthcheck`: `database (healthy)` → `migrate (completed)` + `python-service (healthy)` → `backend (healthy)` → `frontend`.

### 2.6.2 Staging (preliminar)

```mermaid
flowchart LR
    gh["GitHub Actions<br/>CI verde en main"] -->|"push imágenes :sha"| ghcr[("GHCR<br/>ghcr.io/dakotahh1/smartcommerce-*")]
    gh -->|"terraform plan/apply<br/>(entorno staging, aprobación)"| host
    subgraph host["Host de staging (VM Linux con Docker)"]
        tfres["Recursos Terraform (provider docker):<br/>redes edge/services/data · volumen db ·<br/>contenedores frontend, backend, python, postgres"]
    end
    ghcr -->|"pull"| host
    gh -->|"smoke tests + GET /api/health"| host
    users(["Docentes / testers"]) -->|"HTTPS"| host
```

Detalle en [09-staging-terraform.md](09-staging-terraform.md) (rama de infraestructura). El despliegue definitivo no se exige en EP1; el pipeline sí levanta un **staging efímero** con las imágenes construidas y ejecuta pruebas de salud y de humo antes de aprobar.

## 2.7 Aspectos transversales

| Aspecto | Decisión |
|---|---|
| Configuración | Variables de entorno validadas al arrancar (Joi en NestJS, Pydantic Settings en Python); `.env.example` por servicio |
| Observabilidad | Logs JSON (Pino / structlog) con `requestId` propagado Angular → NestJS → Python; `/api/health` agregado; métricas de latencia por request |
| Errores | Formato uniforme `{statusCode, code, message, details, requestId, timestamp, path}` sin trazas internas |
| Seguridad | Helmet, CORS restringido, rate limiting, validación estricta, JWT corto + refresh rotativo, RBAC, token entre servicios, contenedores sin root, redes internas, mínimo privilegio en BD |
| Resiliencia | Timeouts, reintentos acotados con backoff, circuit breaker y respuesta degradada |
| Versionado de API | Prefijo `/api/v1` (URI versioning de NestJS) |
