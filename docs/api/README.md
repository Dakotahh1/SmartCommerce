# Especificaciones OpenAPI

Contratos de las dos APIs del sistema, generados desde el código y versionados para poder revisarlos sin levantar los servicios.

| Archivo | API | Se genera con |
|---|---|---|
| [`backend.openapi.json`](backend.openapi.json) | API pública de NestJS (`/api/...`): autenticación, catálogo, preferencias, recomendaciones, administración y salud | `cd backend && npm run build && npm run openapi` |
| [`python-service.openapi.json`](python-service.openapi.json) | Servicio interno FastAPI (solo lo invoca NestJS con `X-Internal-Token`): ingesta y normalización, ranking SmartMatch, comparación, aprendizaje, métricas y salud | `cd python-service && uv run python scripts/export_openapi.py` |

- **Cómo verlas:** con el stack corriendo, en `http://localhost:8080/api/docs` (NestJS) y en `/docs` del servicio Python fuera de producción. Sin el stack, cualquier visor OpenAPI 3 sirve (por ejemplo, la extensión OpenAPI de VS Code).
- **Siempre al día:** el pipeline regenera ambas especificaciones (`--check`) y falla si el archivo versionado no coincide con el código, así que un cambio de contrato queda visible en el diff del pull request.
- **Cómo se generan:** NestJS arma el grafo de módulos en modo *preview* (sin base de datos ni servicio Python) a partir del código compilado, porque el plugin de Swagger agrega los esquemas de los DTO durante `nest build` ([`backend/src/openapi.ts`](../../backend/src/openapi.ts)). FastAPI construye el esquema desde los modelos Pydantic sin arrancar el servidor ([`python-service/scripts/export_openapi.py`](../../python-service/scripts/export_openapi.py)).

Los contratos que NestJS valida en tiempo de ejecución sobre las respuestas del servicio Python (zod) están en [`backend/src/modules/smartmatch/smartmatch.contracts.ts`](../../backend/src/modules/smartmatch/smartmatch.contracts.ts); los detalles del servicio interno, en [`python-service/README.md`](../../python-service/README.md).
