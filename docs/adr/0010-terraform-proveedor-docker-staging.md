# ADR-0010: Terraform con proveedor Docker para un staging reproducible y portable

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

La infraestructura debe definirse con Terraform (proveedor, recursos, variables, salidas, redes, almacenamiento, servicios, base de datos, reglas de acceso y separación de ambientes) y `fmt`, `validate` y `plan` deben ejecutarse en el pipeline. El equipo no dispone de una cuenta cloud con presupuesto garantizado y `terraform plan` contra un proveedor cloud requiere credenciales reales.

## Decisión

- Usar el proveedor **`kreuzwerker/docker`** para describir el stack completo sobre un **host Docker** (VM Linux de staging): redes `edge` (pública), `api`, `services` y `data` (internas) y `egress` (salida solo del servicio Python), volumen persistente de PostgreSQL, contenedores de frontend, backend, servicio Python y base de datos con límites, healthchecks y variables.
- Estructura con **módulo reutilizable** (`infra/terraform/modules/smartcommerce-stack`) y **raíces por ambiente** (`environments/staging`, `environments/dev`), cada una con sus variables y backend de estado propio (fuera del repositorio).
- En CI, `plan` se ejecuta contra el daemon Docker del runner (mismo proveedor y recursos), lo que valida la definición sin credenciales cloud; el `apply` a staging real se habilita cuando existan los secretos del host (`STAGING_DOCKER_HOST`, llave SSH) y requiere aprobación del *environment* `staging` de GitHub.

## Alternativas consideradas

- **AWS/Azure/GCP (ECS, Container Apps, Cloud Run)**: más representativo de producción, pero requiere cuenta con tarjeta/créditos y credenciales para `plan`. Se puede agregar un módulo cloud que cree la VM en EP2 sin cambiar el módulo del stack.
- **Render/Railway**: proveedores Terraform comunitarios que igualmente requieren API key para `plan`.
- **Solo Docker Compose en el host**: no cumple infraestructura como código ni separación de ambientes.

## Consecuencias

- (+) Portabilidad: cualquier VM con Docker (universidad, Oracle Free Tier, Azure for Students) sirve como staging.
- (+) `plan` verificable en CI desde EP1.
- (−) No aprovisiona la VM ni DNS/TLS; se documenta y se abordará en EP2.
