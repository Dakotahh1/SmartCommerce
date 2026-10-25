# Registro de trabajo · Entrega Parcial 2

> **Información web, procesamiento e integración del servicio Python.** Este documento resume, punto por punto, qué se verificó y qué se hizo para la EP2, cómo se hizo y dónde está la evidencia. Ramas: `feat/ep2-informacion-web` ([PR #59](https://github.com/Dakotahh1/SmartCommerce/pull/59), 15-10-2026) y `feat/ep2-staging-oracle` ([PR #70](https://github.com/Dakotahh1/SmartCommerce/pull/70), 25-10-2026). Los commits citados están en `main`.
>
> Leyenda: ✅ cumplido y verificado · 🟡 implementado, falta una acción del equipo · ⏳ planificado para la entrega final (no exigido en EP2)

## 1. Verificación de la EP1

Se revisaron los 10 entregables y la demostración mínima de la EP1 contra el repositorio (tag `v0.1.1-ep1`).

| Entregable EP1 | Estado | Evidencia |
|---|---|---|
| Definición del proyecto | ✅ | [docs/01](01-definicion-proyecto.md) |
| Arquitectura (contexto, contenedores, despliegue, datos, flujo, ADR) | ✅ | [docs/02](02-arquitectura.md), [docs/03](03-modelo-datos.md), [ADR 0001–0012](adr/README.md) |
| Frontend Ionic + Angular + Capacitor, navegación, diseño adaptable | ✅ | `frontend/` (42 pruebas pasan, build PWA OK) |
| Backend NestJS modular, DTO, PostgreSQL, migraciones, auth, salud | ✅ | `backend/` (47 pruebas unitarias + 8 e2e pasan) |
| Servicio Python FastAPI, integración, salud, errores | ✅ | `python-service/` (102 pruebas, cobertura 96,5 %) |
| Dockerfiles, Compose, comunicación entre contenedores | ✅ | `docker-compose.yml`, `scripts/*-test.sh` |
| Pipeline DevSecOps con quality gates | ⚠️ → ✅ | **Estaba bloqueado**: desde el 12-10 todas las ejecuciones fallaban en `npm audit` por avisos nuevos (Angular router *high*, piscina *critical*, source-map-js *high*). Corregido (ver §3.1) |
| Variables, secretos, `.env.example`, `.gitignore` | ✅ | [docs/08](08-variables-y-secretos.md) |
| Terraform preliminar (fmt, validate, plan) | ✅ | Verificado localmente con Terraform 1.16.3 |
| README y documentación | ✅ | Actualizados para la EP2 |

Hallazgo adicional corregido: las páginas de administración se desbordaban horizontalmente en móviles (375 px) por el ancho mínimo de las tablas (detectado al probar en el navegador).

### 1.1 Retroalimentación de la EP1 y mejoras trazables

Al 25-10-2026 el equipo **no recibió retroalimentación formal** de la EP1 (ni en la plataforma del curso ni en el repositorio). Para no depender de ella, el equipo evaluó su propia entrega contra la rúbrica de la EP1 y contra lo que la EP2 necesita como base, y corrigió cada hallazgo en un commit propio:

| Hallazgo de la autoevaluación | Área | Corrección | Evidencia |
|---|---|---|---|
| El pipeline estaba en rojo desde el 12-10 por avisos nuevos de dependencias, y Dependabot no podía actualizar Angular | Pipeline | Angular 22.2 con runtime y tooling juntos; Dependabot los agrupa | `ff5ba5a` |
| Las páginas de administración se desbordaban en móviles (375 px) | Frontend · diseño adaptable | Tablas con desplazamiento propio | `c16b6f6` |
| Una búsqueda con texto mal codificado podía responder 500 | Backend · validación | El DTO la rechaza con 400 | `b3ed26f` |
| El job de despliegue estaba activo sin un host real y fallaba en cada push a `main` | Pipeline · arquitectura | Staging real en Oracle Cloud (ARM), imágenes amd64 + arm64, preparación del host en código | [PR #70](https://github.com/Dakotahh1/SmartCommerce/pull/70): `8e1a3f8`, `d5881aa`, `d95b046`, `422821e`, [ADR-0016](adr/0016-staging-oracle-cloud-arm.md) |
| La arquitectura de despliegue seguía como "preliminar" | Arquitectura | Diagrama y descripción del staging real | `7e6c464` |
| La documentación de las APIs solo se podía ver con los servicios corriendo, y Swagger mostraba `page`, `limit` y `days` como objetos | Documentación · contratos | Especificaciones OpenAPI versionadas en [docs/api](api/README.md), verificadas por el pipeline; tipos explícitos | `b2d1c51`, `530daf4` |
| Los valores por defecto de versión seguían en 0.1.0 | Trazabilidad de versiones | 0.2.0 en paquetes, configuración e infraestructura | `0e81954` |
| La especificación adaptativa decía 30 días de decaimiento; el código usa 14 | Documentación | Alineada con el código | `287aac3` |
| El registro de la EP2 citaba commits que no existen en `main` | Trazabilidad | Commits reales del PR #59 | `9dca484` |
| La sección del pipeline describía imágenes de una sola arquitectura | Documentación | Matriz por arquitectura y manifiesto multiarquitectura | `7d8da21` |

El backlog quedó actualizado en §5 y el estado de cada entregable en §2. Si llega retroalimentación docente, se registrará aquí con la misma estructura (hallazgo, corrección y evidencia).

## 2. Lista de comprobación de la EP2

| # | Entregable (enunciado §24.2) | Estado | Dónde |
|---|---|---|---|
| 1 | Correcciones de la EP1: retroalimentación, pipeline, arquitectura, documentación, backlog | ✅ | §1.1 (sin retroalimentación formal: autoevaluación con correcciones trazables); [docs/02](02-arquitectura.md)–[09](09-staging-terraform.md) actualizados; backlog en §5 |
| 2 | Fuente web: identificación, datos, justificación, método, frecuencia, revisión legal/ética/privacidad | ✅ | [docs/04](04-fuente-web.md) (§4.4 estrategia de actualización real, §4.13 revisión de uso responsable) |
| 3 | Recuperación y preparación: extracción automatizada, validación, limpieza, normalización, deduplicación, trazabilidad, errores, indisponibilidad, actualización | ✅ | §3.2, §3.3; [docs/10 §10.2–10.3](10-recuperacion-y-evaluacion.md) |
| 4 | Integración del servicio Python: procesamiento no trivial, endpoints documentados, contratos, validación, pruebas, errores, timeouts, indisponibilidad | ✅ | Especificación OpenAPI en [docs/api](api/README.md) (y `/docs` de FastAPI); contratos zod en NestJS; e2e + `integration-test.sh` |
| 5 | Persistencia o indexación: datos, procedencia, fechas, índice, duplicados, criterios de búsqueda, relación con datos propios | ✅ | §3.4; [docs/10 §10.4](10-recuperacion-y-evaluacion.md#104-persistencia-procedencia-e-indexación) |
| 6 | Recuperación de información: corpus, consulta, tokenización, índice, ranking, resultados con metadatos | ✅ | §3.4; [docs/10 §10.5](10-recuperacion-y-evaluacion.md#105-recuperación-de-información-buscador) |
| 7 | Evaluación de la información recuperada (métrica justificada) | ✅ | §3.5; [docs/10 §10.6](10-recuperacion-y-evaluacion.md#106-evaluación-de-la-información-recuperada) |
| — | Integración funcional (Ionic/Angular ↔ NestJS ↔ FastAPI ↔ PostgreSQL ↔ visualización) | ✅ | Probado de punta a punta con datos reales (§4) |
| 8 | Diseño preliminar de la capacidad adaptativa | ✅ | [docs/05 §5.10](05-motor-smartmatch.md#510-especificación-preliminar-para-el-módulo-3-ep2) |
| 9 | Pipeline: pruebas Python, integración NestJS↔FastAPI, recuperación, lint, SAST, dependencias Python, secretos, Trivy, Terraform, **despliegue automático en staging**, salud posterior | ✅ / 🟡 | §3.6. El job de despliegue está listo; **se activa al configurar el host de staging** (§5) |
| 10 | Observabilidad inicial: logs estructurados, correlación, errores, salud NestJS/FastAPI/PostgreSQL, errores de la fuente, tiempos | ✅ | §3.5 (métricas de la fuente), `/api/health`, `/api/health/metrics`, `X-Request-Id` |
| 11 | Documentación actualizada | ✅ | README, docs/02–10, [docs/api](api/README.md) (NestJS y FastAPI), ADR 0013–0016, este registro |

**Demostración mínima de la EP2:**

| # | Qué mostrar | Cómo |
|---|---|---|
| 1 | Recuperación automatizada de información real | Lote programado o *Administración › Ingesta de datos › Ejecutar lote ahora* |
| 2 | Validación y preparación | Columnas *Válidos/Rechazados* y reporte de cobertura de cada ejecución |
| 3 | Procesamiento en FastAPI | `X-Request-Id` del lote visible en los logs de NestJS y de Python |
| 4 | Comunicación NestJS ↔ FastAPI | `/api/health` (`smartmatch: up`) y la ingesta |
| 5 | Persistencia e indexación | *Explorar* con búsqueda por relevancia; `select count(*) from products` |
| 6 | Consulta y visualización | *Explorar* ("sin azúcar", "avena") y detalle con procedencia |
| 7 | Pipeline DevSecOps | Última ejecución: quality gate, integración EP2, evaluación del buscador, despliegue |
| 8 | Versión en staging | 🟡 URL de staging cuando el host esté configurado (`/api/health` muestra `0.2.0+sha-<commit>`) |
| 9 | Métrica de evaluación | *Administración › Calidad de datos* y tabla P@5/MRR/nDCG del resumen del job *Backend* |
| 10 | Error o indisponibilidad | `docker compose stop python-service` (modo degradado) o caída de la fuente (lote `partial`, alerta en *Calidad de datos*) |

## 3. Qué se hizo y cómo

### 3.1 Corrección del pipeline (EP1 → EP2) · `ff5ba5a`

- **Qué:** el quality gate fallaba en todas las ejecuciones por vulnerabilidades publicadas después de la EP1.
- **Cómo:** Angular 22.1 → 22.2.x (runtime y tooling juntos, lockfile regenerado) y `npm audit fix` en el backend. Quedan 3 avisos *moderate* (no bloqueantes) en el CLI de Capacitor. Además, Dependabot tenía el runtime y el tooling de Angular en **grupos separados**, que nunca podían resolverse porque sus `peerDependencies` son exactas: ahora van juntos.

### 3.2 Ingesta automatizada y programada · `2bb5aa8`

- **Qué:** extracción sin intervención manual, como estrategia de actualización.
- **Cómo:** `IngestionScheduler` en NestJS recorre objetivos `pais/categoria` cada `INGESTION_INTERVAL_MINUTES` (6 h en staging), página a página, reutilizando el flujo de la ingesta manual. Un `pg_try_advisory_lock` impide lotes simultáneos entre réplicas; si la fuente falla en un objetivo se registra y el lote sigue (`partial`). Nuevos endpoints `GET /admin/ingestions/schedule` y `POST /admin/ingestions/schedule/run` (202, asíncrono). Configuración validada con zod, en Compose, `.env.example` y Terraform. Decisión en [ADR-0013](adr/0013-ingesta-programada-sin-cola.md).

### 3.3 Normalización de texto para la búsqueda · `7a0877d`

- **Qué:** tokenización y normalización como parte de la preparación de los datos.
- **Cómo:** `app/normalization/text.py` (minúsculas, sin tildes, palabras vacías, plurales, prefijo `multi-`, vocabulario controlado de categorías y sellos inglés → español). Cada producto incluye `searchPrimary` y `searchSecondary`. Los casos de prueba están en un JSON compartido que también ejecuta el backend, así ambos lados aplican exactamente las mismas reglas.

### 3.4 Índice y ranking por relevancia · `0cf578e`

- **Qué:** índice de búsqueda, criterio de ranking y resultados con metadatos.
- **Cómo:** migración `SearchIndex` con `search_vector` generado (pesos A/B) e índice GIN; la consulta se convierte en un `tsquery` seguro de prefijos y se ordena por `ts_rank_cd` (normalización 1). La API devuelve `relevance` y el detalle muestra la procedencia. Decisión en [ADR-0014](adr/0014-indice-busqueda-postgresql.md).
- **Evaluación:** corpus real de 23 productos (`evaluation/retrieval/corpus.json`) y 10 consultas juzgadas. Resultado: **P@5 0,70 · MRR 1,00 · nDCG@5 0,927**, contra 0,62 / 0,933 / 0,840 del orden base de la EP1. La variante del ranking se eligió midiendo. Corre en cada pipeline y lo bloquea si empeora.

### 3.5 Calidad de los datos y observabilidad · `17c21d6`, `48a00ba`

- **Qué:** métricas de la información recuperada y registro de errores de la fuente externa.
- **Cómo:** Python mide cada llamada a Open Food Facts (resultado, latencia, último error) y la expone en `/v1/metrics`. NestJS calcula en `GET /api/v1/admin/data-quality` la validez, duplicados, cobertura de campos y de la fuente, actualidad, tasa de error y tiempos, con **alertas por umbral**.
- **Resultado real** (ingesta programada contra Open Food Facts, 15-10-2026): 40 obtenidos, **95 % válidos**, **0 % duplicados**, 31,1 % de la categoría cubierta; la fuente respondió 503 en *dairies* y el sistema lo registró, alertó y siguió funcionando.

### 3.6 Frontend · `7807d99`, `c16b6f6`

- Nueva pantalla **Calidad de datos** (alertas, indicadores, cobertura, fuente, rechazos y fallas, ventana de 7/30/90 días).
- **Ingesta programada** en la pantalla de ingesta: estado, próxima ejecución, resultado por objetivo y botón "Ejecutar lote ahora" con actualización automática.
- **Explorar** informa el orden por relevancia y sugiere buscar por sellos.
- Corrección del desborde en móviles de las páginas de administración (verificado en el navegador a 375 px).

### 3.7 Robustez de la API · `b3ed26f`

Una búsqueda con texto mal codificado (U+FFFD) o caracteres de control podía terminar en 500 según la codificación de la base. Ahora el DTO la rechaza con 400. Se detectó en la prueba manual de extremo a extremo.

### 3.8 Pipeline: integración, despliegue y rollback · `2a7087e`, `c30993a`

- **Fuente simulada** (`docker-compose.source-mock.yml`): sirve una instantánea real de Open Food Facts con el mismo contrato, para que las pruebas sean deterministas y no carguen la fuente real. Detenerla simula la caída.
- **`scripts/integration-test.sh`**: 30 verificaciones del flujo fuente → FastAPI → NestJS → PostgreSQL → consulta, entre ellas idempotencia, búsqueda, procedencia, calidad, lote programado, caída de la fuente y correlación de logs. Se ejecutó localmente con resultado 30/30.
- **`deploy-staging`**: en cada push a `main` que pasa el quality gate se hace `terraform apply` de la imagen `sha-<commit>`, se verifica la salud con la versión exacta, se corren pruebas de humo contra la URL pública y, si algo falla, se aplica **rollback automático** a la etiqueta anterior. También hay un workflow manual *Rollback staging*. Decisión en [ADR-0015](adr/0015-despliegue-staging-rollback.md).
- Validado localmente: actionlint, ShellCheck, `terraform fmt` y `validate`.

### 3.9 Staging real en Oracle Cloud · [PR #70](https://github.com/Dakotahh1/SmartCommerce/pull/70)

- **Qué:** el despliegue automático necesitaba un host real y accesible para la demostración, sin costo.
- **Cómo:** VM *Always Free* de Oracle Cloud en Santiago (Ampere ARM64, 2 OCPU y 12 GB). El pipeline construye cada imagen de forma nativa para amd64 y arm64, escanea ambas con Trivy y publica un manifiesto multiarquitectura (`8e1a3f8`). `infra/staging/bootstrap-oracle.sh` deja el host listo en un solo paso: Docker, usuario `deploy` solo con llave, SSH sin contraseñas, firewall y Caddy con HTTPS automático (`d5881aa`). La huella del host es una variable pública y el origen real del staging se agrega a CORS al desplegar (`d95b046`). Decisión en [ADR-0016](adr/0016-staging-oracle-cloud-arm.md); pasos en [docs/09 §9.7](09-staging-terraform.md#97-puesta-en-marcha-del-host-y-rollback).

### 3.10 Contratos OpenAPI versionados · `b2d1c51`, `530daf4`

- **Qué:** documentación de las APIs de NestJS y FastAPI revisable sin levantar los servicios.
- **Cómo:** ambas especificaciones se generan desde el código ([docs/api](api/README.md)): NestJS en modo *preview* (sin base de datos) y FastAPI sin arrancar el servidor. El pipeline las regenera y falla si el archivo versionado no coincide, así un cambio de contrato queda visible en el pull request.

### 3.11 Mantenimiento de seguridad del 25-10 · `2cfb2e2`, `b1bd26f`, `2f12660`, `a9462a8`

El pipeline bloqueó el PR #70 por vulnerabilidades publicadas esa semana, ajenas al cambio: certifi (pip-audit), vite y zod (frontend), multer y body-parser (backend) y tres altas en Nginx 1.30.5 (Trivy). Se corrigieron con actualizaciones puntuales; cuando el paquete afectado venía fijado por otra dependencia (vite en `@angular/build`, multer en `@nestjs/platform-express`) se forzó la versión corregida con `overrides`. Es evidencia de que los quality gates siguen bloqueando lo que deben (ver [docs/07 §7.5](07-pipeline-devsecops.md#75-evidencia-de-bloqueo)).

## 4. Cómo se verificó

| Verificación | Resultado |
|---|---|
| Frontend: lint, formato, tipos, pruebas, build | ✅ 46 pruebas |
| Backend: lint, formato, tipos, unitarias | ✅ 84 pruebas |
| Backend e2e con PostgreSQL 17 real (incluye evaluación del buscador) | ✅ 12 pruebas |
| Python: Ruff, formato, mypy estricto, pytest | ✅ 130 pruebas, cobertura 96,9 % |
| `integration-test.sh` contra el stack local | ✅ 30/30 |
| Prueba manual de extremo a extremo con **datos reales** de Open Food Facts (FastAPI + NestJS + PostgreSQL + Angular en el navegador) | ✅ ingesta programada, búsqueda, calidad de datos, caída parcial real de la fuente |
| Terraform 1.16.3 `fmt -check` y `validate` (dev y staging) | ✅ |
| actionlint y ShellCheck | ✅ |

No verificado localmente (no hay Docker en el equipo de desarrollo): la construcción de imágenes, Trivy y el staging efímero con Compose. Se verifican en el pipeline al abrir el pull request.

## 5. Backlog y pendientes del equipo

| Pendiente | Responsable sugerido | Para |
|---|---|---|
| 🟡 Crear la VM de Oracle Cloud ([docs/09 §9.7.1](09-staging-terraform.md#971-crear-la-vm-en-oracle-cloud)), prepararla con `bootstrap-oracle.sh` y configurar `STAGING_DOCKER_HOST`, `STAGING_URL`, `STAGING_SSH_KNOWN_HOSTS` y el secreto `STAGING_SSH_PRIVATE_KEY` ([docs/09 §9.7](09-staging-terraform.md#97-puesta-en-marcha-del-host-y-rollback)) | Backend y DevSecOps | EP2 (demostración 8) |
| 🟡 Hacer públicos los paquetes de GHCR (o `docker login` en la VM) | Backend y DevSecOps | EP2 |
| 🟡 Abrir el PR, revisar y aprobar; crear el tag `v0.2.0-ep2` y la release | Todo el equipo | EP2 |
| 🟡 Actualizar el tablero Trello con estas tarjetas y registrar la participación de cada integrante | Todo el equipo | EP2 |
| ✅ `APP_VERSION` en `0.2.0` en las variables de GitHub y en los valores por defecto del código (`0e81954`) | Backend y DevSecOps | EP2 |
| ✅ Retroalimentación de la EP1: no se recibió; autoevaluación y correcciones trazables en §1.1 | Todo el equipo | EP2 |
| ⏳ Precios desde Open Prices (cobertura hoy 0 %) | Datos e inteligencia | EF |
| ⏳ Modelo de usuario completo y adaptación en *Explorar* (docs/05 §5.10) | Datos e inteligencia | EF |
| ⏳ Evaluación de recomendaciones personalizadas vs. base (P@5, nDCG@10) y estudio con usuarios | Todo el equipo | EF |
| ⏳ Ampliar el conjunto de evaluación del buscador a varias categorías; sinónimos y tolerancia a errores ortográficos | Datos e inteligencia | EF |
| ⏳ Respaldo programado de PostgreSQL y backend remoto del estado de Terraform | Backend y DevSecOps | EF |
