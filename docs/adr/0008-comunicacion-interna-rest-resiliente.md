# ADR-0008: REST interno con token de servicio, timeouts, reintentos y circuit breaker

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

La comunicación NestJS → FastAPI debe considerar contratos, validación en ambos servicios, autenticación entre servicios, tiempos máximos, indisponibilidad, respuestas inválidas, reintentos limitados, registros y degradación controlada.

## Decisión

- **HTTP/JSON** sobre la red interna de Docker (`PYTHON_SERVICE_URL=http://python-service:8000`), rutas versionadas `/v1`.
- **Autenticación de servicio** con cabecera `X-Internal-Token` (secreto compartido de ≥ 32 bytes) verificada en tiempo constante; el servicio Python además no expone puertos al exterior.
- **Propagación** de `X-Request-Id` para correlacionar logs.
- **Timeouts** por operación: salud 2 s, ranking 5 s, ingesta 30 s.
- **Reintentos** (máx. 2) con backoff exponencial + jitter solo ante errores de red, 502/503/504 y 429, y solo en operaciones idempotentes.
- **Circuit breaker** en memoria: tras 5 fallos consecutivos se abre 30 s y se responde en **modo degradado** sin esperar.
- **Validación de respuestas** con `zod` en NestJS; una respuesta inválida se trata como fallo.

## Alternativas consideradas

- **gRPC**: contratos fuertes y eficientes, pero agrega tooling y el enunciado pide REST inicialmente.
- **mTLS entre servicios**: más robusto; excesivo para EP1 dentro de una red Docker aislada. Se documenta como mejora para producción.
- **Cola de mensajes**: ver ADR-0012.

## Consecuencias

- (+) NestJS nunca queda bloqueado indefinidamente; el usuario recibe respuestas comprensibles.
- (+) Fallos del motor no afectan autenticación, catálogo ni comparaciones base.
- (−) El estado del circuit breaker es por instancia (aceptable con una réplica).
