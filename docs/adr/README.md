# Registro de decisiones de arquitectura (ADR)

Formato basado en [MADR](https://adr.github.io/madr/): contexto, decisión, alternativas y consecuencias. Un ADR aceptado no se edita: se reemplaza por uno nuevo que lo marque como *Reemplazado*.

| # | Decisión | Estado | Fecha |
|---|---|---|---|
| [0001](0001-registrar-decisiones-de-arquitectura.md) | Registrar decisiones con ADR | Aceptado | 2026-09-17 |
| [0002](0002-frontend-multiplataforma-angular-ionic-capacitor.md) | Frontend multiplataforma con Angular standalone, Ionic y Capacitor | Aceptado | 2026-09-17 |
| [0003](0003-nestjs-api-principal-python-servicio-especializado.md) | NestJS como API principal y Python/FastAPI como servicio especializado sin estado | Aceptado | 2026-09-17 |
| [0004](0004-postgresql-typeorm-migraciones.md) | PostgreSQL con TypeORM, migraciones SQL explícitas y roles de mínimo privilegio | Aceptado | 2026-09-17 |
| [0005](0005-fuente-open-food-facts.md) | Open Food Facts y Open Prices como fuentes web vía API oficial | Aceptado | 2026-09-17 |
| [0006](0006-motor-smartmatch-multicriterio-explicable.md) | Motor SmartMatch multicriterio explicable en lugar de un modelo de caja negra | Aceptado | 2026-09-17 |
| [0007](0007-autenticacion-jwt-refresh-rotativo.md) | JWT de corta duración con refresh token opaco rotativo y RBAC | Aceptado | 2026-09-17 |
| [0008](0008-comunicacion-interna-rest-resiliente.md) | REST interno con token de servicio, timeouts, reintentos y circuit breaker | Aceptado | 2026-09-17 |
| [0009](0009-pipeline-devsecops-github-actions.md) | Pipeline DevSecOps en GitHub Actions con quality gates | Aceptado | 2026-09-17 |
| [0010](0010-terraform-proveedor-docker-staging.md) | Terraform con proveedor Docker para un staging reproducible y portable | Aceptado | 2026-09-17 |
| [0011](0011-estrategia-de-ramas-github-flow.md) | GitHub Flow con ramas por área, commits convencionales y PR obligatorios | Aceptado | 2026-09-17 |
| [0012](0012-sin-cola-de-mensajes-en-ep1.md) | No incorporar cola de mensajes en EP1 (procesamiento síncrono acotado) | Aceptado | 2026-09-17 |
