# ADR-0003: NestJS como API principal y Python/FastAPI como servicio especializado sin estado

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

El enunciado exige NestJS como punto único de acceso, un servicio Python no trivial integrado vía REST y que Python no modifique directamente las tablas administradas por NestJS. El procesamiento de datos y la recomendación se benefician del ecosistema Python (Pydantic, httpx, librerías científicas para EP2/EF).

## Decisión

- **NestJS** es la única puerta de entrada del frontend: autenticación, autorización, validación, negocio, persistencia y orquestación.
- **Python + FastAPI** implementa: (1) obtención de datos de Open Food Facts, (2) validación/normalización/deduplicación, (3) motor SmartMatch (ranking, comparación, aprendizaje).
- Python es **sin estado y sin credenciales de base de datos**: NestJS le envía en cada solicitud los datos necesarios (perfil, historial, candidatos) y persiste los resultados.
- Contratos JSON versionados (`/v1`) documentados con OpenAPI (FastAPI) y validados en ambos lados (Pydantic / zod).

## Alternativas consideradas

- **Python con acceso directo a PostgreSQL**: más simple para lecturas masivas, pero duplica modelos, rompe la regla de propiedad única y exige gestionar concurrencia y permisos adicionales. Se reevaluará solo si el volumen lo justifica (nuevo ADR).
- **Endpoint interno de NestJS consultado por Python**: agrega dependencia circular y latencia; innecesario porque NestJS ya tiene los datos al invocar.
- **Implementar el motor en TypeScript**: posible, pero el enunciado requiere procesamiento no trivial en Python y EP2/EF usarán librerías científicas.

## Consecuencias

- (+) Límites claros de responsabilidad y seguridad (Python no puede filtrar datos de la BD).
- (+) Python escala horizontalmente sin coordinación.
- (−) Payloads más grandes en recomendaciones (se limitan candidatos a ≤ 200 por solicitud).
- (−) NestJS debe mantener un ranking de respaldo para degradación controlada.
