# ADR-0011: GitHub Flow con ramas por área, commits convencionales y PR obligatorios

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

La rúbrica evalúa trazabilidad, uso de ramas, revisiones y contribuciones equilibradas; el enunciado penaliza un único commit o subir todo al final. Cada integrante debe poder mostrar su aporte en la defensa.

## Decisión

- **GitHub Flow**: `main` siempre desplegable; todo cambio entra por **pull request** desde ramas cortas.
- Nombres de rama por tipo y área: `feature/<area>-<descripcion>`, `fix/…`, `docs/…`, `ci/…`, `infra/…`, `design/…`.
- **Conventional Commits** en español: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:`.
- PR con plantilla (qué, por qué, cómo probar, checklist de seguridad) y **pipeline verde** (`quality-gate`) antes de integrar.
- Entregas identificadas con **tags semánticos** (`v0.1.0-ep1`, `v0.2.0-ep2`, `v1.0.0`) y releases de GitHub.

## Alternativas consideradas

- **Git Flow** (`develop`, `release/*`): sobrecarga innecesaria para un equipo pequeño con despliegue continuo.
- **Trunk-based sin PR**: pierde la evidencia de revisión que exige la rúbrica.

## Consecuencias

- (+) Historial legible y trazable a entregas y ADR.
- (−) Requiere revisiones oportunas para no bloquear al equipo.
