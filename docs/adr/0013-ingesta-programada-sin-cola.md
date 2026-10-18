# ADR-0013: Ingesta programada en NestJS con advisory lock, sin cola de mensajes

- **Estado:** Aceptado (revisa los criterios de [ADR-0012](0012-sin-cola-de-mensajes-en-ep1.md))
- **Fecha:** 2026-10-15

## Contexto

La EP2 exige una extracción **automatizada** y una **estrategia de actualización**. ADR-0012 dejó abierta la incorporación de una cola (BullMQ + Redis) si las ingestas programadas superaban los 30 s o requerían paralelismo. Un lote de 4 categorías × 2 páginas tarda alrededor de un minuto, dominado por el límite de la fuente (10 búsquedas/min; usamos ≤ 8): **el cuello de botella es la fuente, no el cómputo**, así que paralelizar no aporta.

## Decisión

- Un programador dentro de NestJS (`IngestionScheduler`) ejecuta cada `INGESTION_INTERVAL_MINUTES` un lote que recorre los objetivos `pais/categoria`, página a página, **reutilizando el mismo flujo de la ingesta manual** (Python valida y normaliza; NestJS persiste con upsert idempotente).
- **Un solo lote a la vez**: bandera en memoria + `pg_try_advisory_lock` en PostgreSQL, para que varias réplicas del backend no ejecuten lotes simultáneos sin un coordinador externo.
- Cada página queda en `ingestion_runs` (`trigger = scheduled`, sin usuario) con un `X-Request-Id` derivado del lote: trazabilidad completa en logs y en la base.
- Si la fuente falla en un objetivo, se registra y el lote continúa (`partial`); nunca se borran datos ya persistidos.
- `POST /api/v1/admin/ingestions/schedule/run` dispara el lote de forma **asíncrona** (HTTP 202) y `GET …/schedule` informa estado, próxima ejecución y resultado por objetivo.

## Alternativas

| Alternativa | Por qué no ahora |
|---|---|
| BullMQ + Redis | Un componente más que operar, asegurar y contenerizar, sin ganancia: la fuente limita el ritmo |
| Cron del sistema o de un contenedor que llame a la API | Requiere credenciales de servicio y otro contenedor; se pierde el estado del lote |
| Tarea en segundo plano en FastAPI | Python no debe escribir en PostgreSQL (regla 5.1 del enunciado); NestJS ya coordina |

## Consecuencias

- (+) Sin infraestructura nueva, seguro con réplicas y con la misma ruta de código que la ingesta manual.
- (−) Si el proceso se reinicia en mitad de un lote, ese lote se pierde y se repite en el siguiente intervalo (aceptable: el upsert es idempotente).
- Revisar si se necesitan reintentos persistentes, prioridades o ingestas de catálogos completos (más de 10 minutos).
