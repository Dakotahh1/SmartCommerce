# ADR-0012: No incorporar cola de mensajes en EP1

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

El enunciado permite procesamiento asincrónico (colas o sistemas de tareas) cuando una operación demora demasiado, justificándolo con un ADR. En EP1 las operaciones largas son las ingestas desde Open Food Facts.

## Decisión

No agregar una cola de mensajes en EP1. Las ingestas se ejecutan de forma **síncrona y acotada** (una página de hasta 100 productos por solicitud, timeout de 30 s) y quedan registradas en `ingestion_runs`. Las recomendaciones son operaciones en memoria de milisegundos.

## Criterios para revisar la decisión (EP2)

- Ingestas programadas de categorías completas (> 30 s).
- Necesidad de reintentos persistentes o de ejecutar varias ingestas en paralelo.
- Opciones evaluadas: **BullMQ + Redis** (integración con NestJS) o tareas en segundo plano de FastAPI con estado persistido en NestJS.

## Consecuencias

- (+) Menos componentes que operar y asegurar en EP1.
- (−) Una ingesta grande debe dividirse en varias solicitudes paginadas.
