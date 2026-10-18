# ADR-0015: Despliegue automático en staging con verificación y rollback por etiqueta inmutable

- **Estado:** Aceptado (completa [ADR-0010](0010-terraform-proveedor-docker-staging.md))
- **Fecha:** 2026-10-15

## Contexto

La EP2 exige desplegar automáticamente una versión funcional en staging desde GitHub Actions, con pruebas de salud posteriores, una estrategia básica de rollback y la posibilidad de identificar qué versión del repositorio está desplegada. El staging es una VM con Docker gestionada por Terraform (proveedor `kreuzwerker/docker` por SSH); el estado de Terraform no puede vivir en el repositorio.

## Decisión

- Job `deploy-staging` en `main`, **después** del quality gate y de publicar las imágenes en GHCR. Despliega la etiqueta inmutable `sha-<commit>` con la versión `APP_VERSION+sha-<commit>`, que `/api/health` devuelve: así se demuestra qué commit está corriendo.
- `scripts/deploy-staging.sh` lee la etiqueta desplegada (`terraform output image_tag`), aplica la nueva, verifica la salud (versión, base de datos y SmartMatch), ejecuta las pruebas de humo contra la URL pública y, **si algo falla, vuelve a aplicar la etiqueta anterior** y la verifica. El job termina en error en ambos casos.
- El estado de Terraform se guarda **en el host de staging** (archivo con permisos 600 del usuario de despliegue) y se descarga y devuelve por SSH en cada ejecución; `concurrency: deploy-staging` evita despliegues simultáneos.
- Rollback manual: workflow `Rollback staging` (`workflow_dispatch` con la etiqueta), que usa el mismo script.
- Compatibilidad con la base de datos: las migraciones son **aditivas** (expandir y luego contraer), de modo que la versión anterior funciona sobre el esquema nuevo; un cambio destructivo se reparte en dos versiones.

## Alternativas

| Alternativa | Por qué no ahora |
|---|---|
| Backend remoto S3/GCS/Azure con bloqueo | Requiere una cuenta cloud adicional; queda como mejora (el bloque `backend` admite configuración parcial) |
| Despliegue con `docker compose` por SSH | Duplica la definición de infraestructura y no aprovecha el plan de Terraform validado en CI |
| Blue/green | Requiere el doble de recursos en una VM pequeña |

## Consecuencias

- (+) Cada despliegue es trazable a un commit, verificable y reversible sin intervención manual.
- (−) El estado comparte host con lo que describe: si se pierde la VM, se reconstruye con `terraform apply` sobre estado vacío y la base se restaura desde un respaldo.
- Requiere configurar en GitHub las variables `STAGING_DOCKER_HOST` y `STAGING_URL` y los secretos `STAGING_SSH_PRIVATE_KEY` y `STAGING_SSH_KNOWN_HOSTS` (ver [docs/09](../09-staging-terraform.md)).
