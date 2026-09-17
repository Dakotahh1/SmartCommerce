# Servicio SmartMatch (Python + FastAPI)

Servicio especializado **sin estado** invocado solo por el backend NestJS. Implementa:

1. **Obtención de información web** desde la API oficial de Open Food Facts (rate limit, timeouts, reintentos, caché).
2. **Validación, limpieza, normalización y deduplicación** de productos (GTIN GS1, unidades, alérgenos, dietas, sellos Ley 20.606, puntaje de calidad, procedencia y hash del dato crudo).
3. **Motor SmartMatch**: ranking multicriterio explicable, versión base no adaptativa, comparación de productos y aprendizaje de preferencias. Especificación: [docs/05-motor-smartmatch.md](../docs/05-motor-smartmatch.md).

## Endpoints

| Método | Ruta | Autenticación | Descripción |
|---|---|---|---|
| GET | `/health` | Pública | Liveness (versión, versión del motor, uptime) |
| GET | `/health/ready?deep=true` | Pública | Readiness; con `deep` verifica Open Food Facts (caché 60 s) |
| GET | `/v1/metrics` | `X-Internal-Token` | Conteo, errores 5xx, latencia promedio y p95 por ruta |
| POST | `/v1/ingestion/openfoodfacts/search` | `X-Internal-Token` | Busca en Open Food Facts por país/categoría/marca y devuelve productos normalizados + reporte de calidad |
| POST | `/v1/products/normalize` | `X-Internal-Token` | Normaliza registros crudos (hasta 500) |
| POST | `/v1/recommendations/rank` | `X-Internal-Token` | Ranking personalizado o base con desglose, razones y exclusiones |
| POST | `/v1/comparisons` | `X-Internal-Token` | Compara 2–4 productos: ganador, ganadores por criterio y resumen |
| POST | `/v1/profiles/learn` | `X-Internal-Token` | Pesos efectivos, ajustes y afinidades aprendidas del historial |

Documentación OpenAPI interactiva en `/docs` (deshabilitada cuando `APP_ENV=production`).

### Formato de error

```json
{
  "statusCode": 422,
  "code": "VALIDATION_ERROR",
  "message": "Solicitud inválida",
  "details": [{ "field": "candidates.0.gtin", "message": "String should match pattern ...", "type": "string_pattern_mismatch" }],
  "path": "/v1/recommendations/rank",
  "timestamp": "2026-09-17T12:00:00+00:00",
  "requestId": "3f1c..."
}
```

Códigos: `UNAUTHORIZED` (401), `VALIDATION_ERROR` (422), `TOO_MANY_CANDIDATES` (413), `UPSTREAM_UNAVAILABLE` (502), `UPSTREAM_INVALID_RESPONSE` (502), `INTERNAL_ERROR` (500).

## Desarrollo local

Requisitos: Python 3.13 y [uv](https://docs.astral.sh/uv/).

```bash
cd python-service
uv sync                       # instala dependencias exactas de uv.lock
cp .env.example .env          # definir INTERNAL_API_TOKEN
uv run --env-file .env uvicorn --factory app.main:create_app --reload --port 8000
```

## Calidad

```bash
uv run ruff check .           # lint (incluye reglas de seguridad flake8-bandit)
uv run ruff format --check .  # formato
uv run mypy                   # tipado estricto
uv run pytest                 # pruebas + cobertura (mínimo 85 %)
uv run bandit -c pyproject.toml -r app
uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements.txt && uv run pip-audit -r requirements.txt
```

Las pruebas usan una **muestra real** de Open Food Facts (`tests/fixtures/`, licencia ODbL) y simulan la fuente con `respx` para verificar reintentos, timeouts, respuestas inválidas e indisponibilidad sin depender de la red.

## Docker

```bash
docker build -t smartcommerce-python-service .
docker run --rm -p 8000:8000 -e INTERNAL_API_TOKEN=$(python -c "import secrets;print(secrets.token_urlsafe(48))") smartcommerce-python-service
```

Imagen multi-etapa, dependencias congeladas, usuario sin privilegios (UID 10001), código propiedad de root (solo lectura para el proceso) y `HEALTHCHECK` sobre `/health`.
