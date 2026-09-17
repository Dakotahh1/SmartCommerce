# ADR-0009: Pipeline DevSecOps en GitHub Actions con quality gates

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

El pipeline debe automatizar construcción, validación, análisis de seguridad, contenerización y despliegue, bloqueando ante pruebas fallidas, secretos expuestos, vulnerabilidades críticas, infraestructura inválida o fallas de salud. El repositorio es **privado**, por lo que GitHub Code Scanning (CodeQL) no está disponible sin GitHub Advanced Security.

## Decisión

- Workflow `ci.yml` en cada push y pull request con jobs paralelos por componente y un job final **`quality-gate`** que depende de todos (único check requerido para integrar).
- Herramientas **open source y ejecutables en repos privados**: gitleaks (secretos), Semgrep CE + Bandit (SAST), ESLint/Ruff (lint), `npm audit` y `pip-audit` (dependencias), Hadolint (Dockerfiles), Trivy (imágenes), Terraform `fmt/validate/plan`.
- **Staging efímero en el runner**: `docker compose` con las imágenes recién construidas, espera de *health checks* y *smoke tests* E2E (Angular → NestJS → Python → PostgreSQL). Falla → bloquea.
- **Mínimo privilegio**: `permissions: contents: read` por defecto; acciones de terceros **fijadas por SHA**; secretos solo vía `secrets.*`.
- Instalación reproducible: `npm ci` con lockfile y `uv sync --frozen`.
- Dependabot para npm, uv/pip, Docker, GitHub Actions y Terraform.

## Alternativas consideradas

- **CodeQL**: no disponible en repos privados sin licencia.
- **SonarCloud**: requiere cuenta externa y token; posible mejora.
- **GitLab CI / Jenkins**: el enunciado exige GitHub Actions.

## Consecuencias

- (+) Seguridad integrada desde el primer commit; evidencia verificable de quality gates.
- (−) Tiempo de pipeline mayor (se mitiga con caché y jobs paralelos).
- Las herramientas de escaneo se fijan por versión para evitar ataques de cadena de suministro (p. ej., compromisos de acciones populares).
