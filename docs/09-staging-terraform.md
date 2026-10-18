# 9. Infraestructura como código y ambiente de staging

> Código: [`infra/terraform`](../infra/terraform) · Decisión: [ADR-0010](adr/0010-terraform-proveedor-docker-staging.md) · Pipeline: [07-pipeline-devsecops.md](07-pipeline-devsecops.md)

## 9.1 Ambiente de staging

| Aspecto | Definición (EP1, completada en EP2) |
|---|---|
| Propósito | Validar cada versión integrada en `main` en condiciones similares a producción antes de una release (demo al docente, pruebas de aceptación, evaluación del motor) |
| Host | VM Linux con Docker Engine (≥ 2 vCPU, 4 GB RAM, 30 GB disco), por ejemplo una VM universitaria, Oracle Cloud Free Tier o Azure for Students |
| Acceso a Docker | Terraform se conecta por **SSH** (`docker_host = "ssh://deploy@<ip>"`) con un usuario `deploy` sin contraseña y llave dedicada; el daemon no se expone por TCP |
| Exposición | Solo el gateway web, ligado a `127.0.0.1:8080`; un proxy TLS del host (Caddy o Nginx con Let's Encrypt) publica `https://staging.<dominio>` en 443. Firewall: solo 22 (restringido) y 443 |
| Imágenes | Publicadas por el pipeline en GHCR con etiqueta inmutable `sha-<commit>` (y `main`); el staging nunca construye código |
| Datos | Volumen persistente `smartcommerce-staging-db-data`; catálogo poblado y refrescado cada 6 h por la **ingesta programada** (variable `ingestion` de Terraform); **sin datos personales reales** |
| Secretos | Distintos de dev y CI; en el ambiente `staging` de GitHub (`TF_VAR_*`), con aprobación requerida para aplicar |
| Salud | Tras cada despliegue: `GET /api/health` con la versión `APP_VERSION+sha-<commit>`, base de datos y SmartMatch arriba + `scripts/smoke-test.sh` contra la URL pública + lectura del catálogo |
| Despliegue | Automático desde GitHub Actions en cada push a `main` que pasa el quality gate (job `deploy-staging`, [ADR-0015](adr/0015-despliegue-staging-rollback.md)) |
| Rollback | Automático si falla la verificación; manual con el workflow *Rollback staging* (§9.7) |
| Estado de Terraform | Nunca en el repositorio. El `plan` del CI usa un estado local efímero; el despliegue guarda el estado en el host de staging (`~deploy/smartcommerce/terraform/staging.tfstate`, permisos 600) y lo descarga/devuelve por SSH en cada ejecución (`terraform init -backend-config=path=…`); `concurrency` impide despliegues simultáneos. Mejora futura: backend remoto con bloqueo |

En EP1 el staging **definitivo no se exige**: el pipeline ya levanta un **staging efímero** en cada ejecución (Docker Compose en el runner, con las imágenes escaneadas) y ejecuta pruebas de humo, aislamiento y resiliencia. Terraform describe el staging persistente y su `plan` se verifica en cada ejecución.

## 9.2 Estructura

```
infra/
├── docker/postgres/init/01-roles.sh        # roles de mínimo privilegio (compartido por Compose y Terraform)
└── terraform/
    ├── modules/smartcommerce-stack/        # módulo reutilizable: redes, volumen, imágenes y contenedores
    │   ├── versions.tf                     # Terraform ≥ 1.9, proveedor kreuzwerker/docker ~> 4.6
    │   ├── variables.tf                    # variables tipadas con validaciones (secretos marcados sensitive)
    │   ├── main.tf                         # recursos
    │   └── outputs.tf                      # URL, redes, volumen, contenedores e imágenes
    └── environments/
        ├── staging/                        # VM de staging (imágenes GHCR)
        │   ├── versions.tf · main.tf · variables.tf · outputs.tf
        │   ├── terraform.tfvars            # configuración NO sensible (versionada)
        │   ├── secrets.auto.tfvars.example # ejemplo local; los reales se ignoran por git
        │   └── .terraform.lock.hcl         # versiones y hashes exactos del proveedor
        └── dev/                            # Docker local con imágenes construidas localmente
```

**Separación de configuración:** el módulo no conoce ambientes; cada raíz define su proveedor (host Docker), su backend de estado, sus valores no sensibles (`terraform.tfvars`) y recibe los secretos por `TF_VAR_*`.

## 9.3 Recursos

| Recurso | Nombre (staging) | Detalle |
|---|---|---|
| `docker_network.edge` | `smartcommerce-staging-edge` | Pública: solo el gateway |
| `docker_network.api` | `smartcommerce-staging-api` | **Interna**: frontend → backend |
| `docker_network.services` | `smartcommerce-staging-services` | **Interna**: backend → python-service |
| `docker_network.data` | `smartcommerce-staging-data` | **Interna**: backend y migrate → database |
| `docker_network.egress` | `smartcommerce-staging-egress` | Salida a Internet solo para python-service |
| `docker_volume.db_data` | `smartcommerce-staging-db-data` | Datos de PostgreSQL |
| `docker_image.postgres` / `docker_image.app[*]` | `postgres:17.11-alpine3.24`, `ghcr.io/…/smartcommerce-*:<tag>` | Versiones fijas; se rechaza `latest` |
| `docker_container.database` | `…-database` | Healthcheck, script de roles subido al contenedor, `wait` hasta estar sano |
| `docker_container.migrate` | `…-migrate` | One-shot con rol owner; Terraform espera su término |
| `docker_container.python_service` | `…-python-service` | `read_only`, `cap_drop ALL`, `no-new-privileges`, límites |
| `docker_container.backend` | `…-backend` | Idem; depende de migrate y python-service |
| `docker_container.frontend` | `…-frontend` | Único puerto publicado; tmpfs para la configuración de Nginx |

### Variables principales

| Variable | Tipo | Sensible | Validación |
|---|---|---|---|
| `environment` | string | no | `dev` o `staging` |
| `runtime_env` | string | no | `staging` o `production` |
| `image_registry`, `image_tag` | string | no | `image_tag` ≠ `latest` |
| `frontend_bind_ip`, `frontend_port` | string, number | no | IPv4 válida; puerto 1024–65535 |
| `cors_origins` | list(string) | no | — |
| `resources` | map(object) | no | Debe definir los 4 servicios |
| `postgres_superuser_password`, `db_owner_password`, `db_app_password` | string | **sí** | ≥ 16 caracteres |
| `jwt_access_secret`, `internal_api_token` | string | **sí** | ≥ 32 caracteres |

### Salidas

`frontend_url`, `health_url`, `networks` (nombre → interna), `database_volume`, `containers` e `images`. Ninguna salida expone secretos.

## 9.4 Uso

```bash
cd infra/terraform/environments/staging

# Secretos (en CI provienen de GitHub Secrets del ambiente staging)
export TF_VAR_postgres_superuser_password="$(openssl rand -base64 32)"
export TF_VAR_db_owner_password="$(openssl rand -base64 32)"
export TF_VAR_db_app_password="$(openssl rand -base64 32)"
export TF_VAR_jwt_access_secret="$(openssl rand -base64 48)"
export TF_VAR_internal_api_token="$(openssl rand -base64 48)"

terraform init
terraform fmt -check -recursive ../..
terraform validate
terraform plan -var "docker_host=ssh://deploy@<ip-staging>" -var "image_tag=sha-<commit>" -out staging.tfplan
terraform apply staging.tfplan          # solo con aprobación (fuera del alcance de EP1)
BASE_URL=https://staging.<dominio> ../../../../scripts/smoke-test.sh
```

Para **dev** (Docker local): `docker compose build` genera las imágenes `smartcommerce-*:local` y `terraform -chdir=infra/terraform/environments/dev apply` levanta el stack en `http://127.0.0.1:8081`.

## 9.5 En el pipeline

El job **Terraform** (bloqueante, parte del quality gate) ejecuta en cada PR y push a `main`:

1. `terraform fmt -check -recursive`.
2. `terraform init -backend=false` + `terraform validate` para `dev` y `staging`.
3. `terraform plan` de **staging** contra el daemon Docker del runner, con las etiquetas `sha-<commit>` y secretos del ambiente `staging` (o efímeros si no existen). El plan legible se publica como artefacto (`plan-staging.txt`, valores sensibles ocultos); el archivo binario del plan nunca se sube porque contiene secretos.

## 9.6 Despliegue automático (EP2)

```mermaid
sequenceDiagram
    participant GA as GitHub Actions (deploy-staging)
    participant VM as Host de staging (SSH)
    participant TF as Terraform
    participant APP as https://staging…
    GA->>VM: descarga estado (staging.tfstate)
    GA->>TF: output image_tag → etiqueta anterior
    GA->>TF: apply image_tag=sha-<commit>, app_version=APP_VERSION+sha-<commit>
    TF->>VM: pull GHCR · migrate · contenedores (healthchecks)
    GA->>APP: GET /api/health (versión, BD, SmartMatch) · smoke-test · catálogo
    alt verificación OK
        GA-->>GA: resumen con versión y URL
    else falla
        GA->>TF: apply image_tag=<anterior> (rollback) y verificación
        GA-->>GA: job en rojo
    end
    GA->>VM: devuelve el estado (siempre)
```

El job solo corre si existe la variable `STAGING_DOCKER_HOST`; sin host configurado el pipeline sigue validando cada versión en el staging efímero.

## 9.7 Puesta en marcha del host y rollback

**Una sola vez, en la VM (Ubuntu 24.04, ≥ 2 vCPU, 4 GB):**

```bash
# Docker y usuario de despliegue sin contraseña, solo con llave
curl -fsSL https://get.docker.com | sh
sudo adduser --disabled-password --gecos "" deploy && sudo usermod -aG docker deploy
sudo -u deploy mkdir -p ~deploy/.ssh && sudo -u deploy chmod 700 ~deploy/.ssh
# pegar la llave pública en ~deploy/.ssh/authorized_keys (ssh-keygen -t ed25519 -f staging_deploy)
# Proxy TLS hacia el gateway ligado a 127.0.0.1:8080 (Caddy obtiene el certificado automáticamente)
sudo apt install -y caddy && echo 'staging.<dominio> { reverse_proxy 127.0.0.1:8080 }' | sudo tee /etc/caddy/Caddyfile && sudo systemctl reload caddy
# Firewall: solo 22 (restringido) y 443
sudo ufw allow 22/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

Las imágenes de GHCR deben ser **públicas** (*Package settings › Change visibility*) o el usuario `deploy` debe ejecutar una vez `docker login ghcr.io` con un token de solo lectura (`read:packages`).

**En GitHub (ambiente `staging`):** variables `STAGING_DOCKER_HOST=ssh://deploy@<host>` y `STAGING_URL=https://staging.<dominio>`; secretos `STAGING_SSH_PRIVATE_KEY` (contenido de `staging_deploy`), `STAGING_SSH_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <host>`) y los cinco secretos de la aplicación ([08 · §8.3](08-variables-y-secretos.md#83-github-actions)).

**Rollback:**

| Situación | Acción |
|---|---|
| Falla el despliegue, el servicio no inicia o fallan los endpoints de salud | Automático: el job vuelve a la etiqueta anterior y lo informa en el resumen |
| Error crítico o vulnerabilidad grave detectada después | *Actions › Rollback staging › Run workflow* con `sha-<commit>` de la última versión estable (las etiquetas de GHCR son inmutables) |
| Versión incompatible con la base de datos | Las migraciones son aditivas (expandir → contraer): la versión anterior funciona sobre el esquema nuevo. Un cambio destructivo se reparte en dos versiones |
| Pérdida del host | Nueva VM + mismo procedimiento; `terraform apply` sobre estado vacío recrea todo; la base se restaura desde un respaldo (`pg_dump` programado, trabajo futuro) |

Para identificar qué está desplegado: `curl https://staging.<dominio>/api/health` → `"version": "0.2.0+sha-<commit>"`, o el resumen del último job `deploy-staging`.

## 9.8 Próximos pasos

- Módulo para aprovisionar la VM en un proveedor cloud y DNS; backend remoto de estado con bloqueo.
- Respaldo programado del volumen de PostgreSQL y rotación de secretos.
