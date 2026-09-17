# ADR-0004: PostgreSQL con TypeORM, migraciones SQL explícitas y roles de mínimo privilegio

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

La persistencia principal debe ser PostgreSQL accedida por NestJS mediante Prisma o TypeORM, con migraciones, índices, restricciones, transacciones y trazabilidad. El catálogo requiere búsqueda de texto en español, arreglos (alérgenos, etiquetas) y JSONB (nutrientes, pesos).

## Decisión

- **PostgreSQL 17** (imagen oficial `postgres:17-alpine`).
- **TypeORM 1.x** con `@nestjs/typeorm`: integración nativa con la inyección de dependencias de NestJS, `DataSource` compartido entre la app y la CLI de migraciones y soporte directo de `text[]`, `jsonb` y `timestamptz`.
- **Migraciones escritas en SQL** dentro de clases TypeORM (`up`/`down`), `synchronize: false` siempre.
- **Dos roles de base de datos**: `smartcommerce_owner` (DDL, usado solo por el contenedor `migrate`) y `smartcommerce_app` (solo DML, usado por la API).
- Transacciones explícitas en operaciones multi-tabla (ingesta, rotación de tokens).

## Alternativas consideradas

- **Prisma**: excelente DX, pero su cliente generado y motor de consultas agregan complejidad a las imágenes Docker y su manejo de `text[]` + búsqueda full-text requiere SQL crudo igualmente.
- **Migraciones autogeneradas por TypeORM**: pueden producir cambios no deseados; se prefieren migraciones revisadas.
- **Un único usuario de BD**: más simple, pero viola mínimo privilegio (una inyección podría ejecutar DDL).

## Consecuencias

- (+) Esquema reproducible y revisable en PR; rollback con `down`.
- (+) Una vulnerabilidad en la API no puede alterar el esquema.
- (−) Las migraciones SQL deben mantenerse sincronizadas con las entidades (se verifica con pruebas de integración en CI).
