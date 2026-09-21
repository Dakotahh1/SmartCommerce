# ──────────────────────────────────────────────────────────────────────────────
# Módulo smartcommerce-stack: stack completo de SmartCommerce sobre un host Docker.
# Equivale a docker-compose.yml (misma segmentación de red, mínimo privilegio y
# healthchecks), pero declarativo, con estado y separado por ambiente.
# ──────────────────────────────────────────────────────────────────────────────

locals {
  prefix = "smartcommerce-${var.environment}"

  labels = {
    "com.smartcommerce.project"     = "smartcommerce"
    "com.smartcommerce.environment" = var.environment
    "com.smartcommerce.managed-by"  = "terraform"
  }

  log_opts = {
    "max-size" = "10m"
    "max-file" = "3"
  }

  # Endurecimiento común de los contenedores de la aplicación.
  hardened_security_opts = ["no-new-privileges:true"]

  images = {
    frontend       = "${var.image_registry}-frontend:${var.image_tag}"
    backend        = "${var.image_registry}-backend:${var.image_tag}"
    python_service = "${var.image_registry}-python-service:${var.image_tag}"
  }

  db_connection_env = [
    "DB_HOST=database",
    "DB_PORT=5432",
    "DB_NAME=${var.db_name}",
    "DB_USER=${var.db_app_user}",
    "DB_PASSWORD=${var.db_app_password}",
    "DB_SSL=false",
  ]
}

# ─── Redes: cada servicio solo alcanza lo que necesita ────────────────────────

resource "docker_network" "edge" {
  name     = "${local.prefix}-edge"
  driver   = "bridge"
  internal = false

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.network" = "edge: único punto publicado" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

resource "docker_network" "api" {
  name     = "${local.prefix}-api"
  driver   = "bridge"
  internal = true

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.network" = "api: frontend a backend" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

resource "docker_network" "services" {
  name     = "${local.prefix}-services"
  driver   = "bridge"
  internal = true

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.network" = "services: backend a python-service" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

resource "docker_network" "data" {
  name     = "${local.prefix}-data"
  driver   = "bridge"
  internal = true

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.network" = "data: backend y migrate a database" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

resource "docker_network" "egress" {
  name     = "${local.prefix}-egress"
  driver   = "bridge"
  internal = false

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.network" = "egress: salida a Internet solo para python-service" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ─── Almacenamiento persistente ───────────────────────────────────────────────

resource "docker_volume" "db_data" {
  name = "${local.prefix}-db-data"

  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ─── Imágenes (versiones inmutables) ──────────────────────────────────────────

resource "docker_image" "postgres" {
  name         = var.postgres_image
  keep_locally = true
}

resource "docker_image" "app" {
  for_each = local.images

  name         = each.value
  keep_locally = var.keep_images_locally
}

# ─── Base de datos ────────────────────────────────────────────────────────────

resource "docker_container" "database" {
  name     = "${local.prefix}-database"
  image    = docker_image.postgres.image_id
  restart  = "unless-stopped"
  shm_size = 128
  memory   = var.resources["database"].memory_mb
  cpus     = var.resources["database"].cpus

  env = [
    "POSTGRES_DB=${var.db_name}",
    "POSTGRES_USER=postgres",
    "POSTGRES_PASSWORD=${var.postgres_superuser_password}",
    "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256",
    "DB_OWNER_USER=${var.db_owner_user}",
    "DB_OWNER_PASSWORD=${var.db_owner_password}",
    "DB_APP_USER=${var.db_app_user}",
    "DB_APP_PASSWORD=${var.db_app_password}",
  ]

  # Script de roles de mínimo privilegio (el mismo que usa Docker Compose).
  upload {
    file       = "/docker-entrypoint-initdb.d/01-roles.sh"
    content    = file("${path.module}/../../../docker/postgres/init/01-roles.sh")
    executable = true
  }

  volumes {
    volume_name    = docker_volume.db_data.name
    container_path = "/var/lib/postgresql/data"
  }

  networks_advanced {
    name    = docker_network.data.id
    aliases = ["database"]
  }

  healthcheck {
    test         = ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U postgres -d ${var.db_name}"]
    interval     = "5s"
    timeout      = "3s"
    retries      = 20
    start_period = "20s"
  }

  wait                  = true
  wait_timeout          = 180
  destroy_grace_seconds = 30
  security_opts         = local.hardened_security_opts
  log_driver            = "json-file"
  log_opts              = local.log_opts

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.service" = "database" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ─── Migraciones (one-shot con el rol owner) ──────────────────────────────────

resource "docker_container" "migrate" {
  name    = "${local.prefix}-migrate"
  image   = docker_image.app["backend"].image_id
  command = ["node", "dist/database/migrate.js", "run"]
  restart = "no"

  # Se ejecuta hasta terminar; Terraform espera su resultado y no lo mantiene corriendo.
  must_run = false
  attach   = true
  logs     = true

  env = concat(local.db_connection_env, [
    "NODE_ENV=${var.runtime_env}",
    "DB_MIGRATION_USER=${var.db_owner_user}",
    "DB_MIGRATION_PASSWORD=${var.db_owner_password}",
  ])

  networks_advanced {
    name = docker_network.data.id
  }

  read_only     = true
  security_opts = local.hardened_security_opts
  capabilities {
    drop = ["ALL"]
  }
  log_driver = "json-file"
  log_opts   = local.log_opts

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.service" = "migrate" })
    content {
      label = labels.key
      value = labels.value
    }
  }

  depends_on = [docker_container.database]
}

# ─── Servicio Python (SmartMatch) ─────────────────────────────────────────────

resource "docker_container" "python_service" {
  name    = "${local.prefix}-python-service"
  image   = docker_image.app["python_service"].image_id
  restart = "unless-stopped"
  memory  = var.resources["python_service"].memory_mb
  cpus    = var.resources["python_service"].cpus

  env = [
    "APP_ENV=${var.runtime_env}",
    "LOG_LEVEL=INFO",
    "INTERNAL_API_TOKEN=${var.internal_api_token}",
    "OFF_USER_AGENT=${var.off_user_agent}",
  ]

  networks_advanced {
    name    = docker_network.services.id
    aliases = ["python-service"]
  }

  networks_advanced {
    name = docker_network.egress.id
  }

  read_only = true
  tmpfs     = { "/tmp" = "size=16m" }
  capabilities {
    drop = ["ALL"]
  }
  security_opts = local.hardened_security_opts
  wait          = true
  wait_timeout  = 120
  log_driver    = "json-file"
  log_opts      = local.log_opts

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.service" = "python-service" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ─── API NestJS ───────────────────────────────────────────────────────────────

resource "docker_container" "backend" {
  name    = "${local.prefix}-backend"
  image   = docker_image.app["backend"].image_id
  restart = "unless-stopped"
  memory  = var.resources["backend"].memory_mb
  cpus    = var.resources["backend"].cpus

  env = concat(local.db_connection_env, [
    "NODE_ENV=${var.runtime_env}",
    "APP_VERSION=${var.app_version}",
    "PORT=3000",
    "LOG_LEVEL=info",
    "CORS_ORIGINS=${join(",", var.cors_origins)}",
    "TRUST_PROXY=true",
    "SWAGGER_ENABLED=${var.swagger_enabled}",
    "THROTTLE_ENABLED=true",
    "JWT_ACCESS_SECRET=${var.jwt_access_secret}",
    "PYTHON_SERVICE_URL=http://python-service:8000",
    "INTERNAL_API_TOKEN=${var.internal_api_token}",
    "SMARTMATCH_INGESTION_TIMEOUT_MS=45000",
  ])

  networks_advanced {
    name    = docker_network.api.id
    aliases = ["backend"]
  }

  networks_advanced {
    name = docker_network.services.id
  }

  networks_advanced {
    name = docker_network.data.id
  }

  read_only = true
  tmpfs     = { "/tmp" = "size=16m" }
  capabilities {
    drop = ["ALL"]
  }
  security_opts = local.hardened_security_opts
  wait          = true
  wait_timeout  = 120
  log_driver    = "json-file"
  log_opts      = local.log_opts

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.service" = "backend" })
    content {
      label = labels.key
      value = labels.value
    }
  }

  depends_on = [docker_container.migrate, docker_container.python_service]
}

# ─── Gateway web (Nginx + PWA) ────────────────────────────────────────────────

resource "docker_container" "frontend" {
  name    = "${local.prefix}-frontend"
  image   = docker_image.app["frontend"].image_id
  restart = "unless-stopped"
  memory  = var.resources["frontend"].memory_mb
  cpus    = var.resources["frontend"].cpus

  env = [
    "API_UPSTREAM=http://backend:3000",
    "DNS_RESOLVER=127.0.0.11",
  ]

  ports {
    internal = 8080
    external = var.frontend_port
    ip       = var.frontend_bind_ip
    protocol = "tcp"
  }

  networks_advanced {
    name = docker_network.edge.id
  }

  networks_advanced {
    name = docker_network.api.id
  }

  read_only = true
  tmpfs = {
    "/tmp"              = "size=32m,uid=101,gid=101"
    "/etc/nginx/conf.d" = "size=1m,uid=101,gid=101"
  }
  capabilities {
    drop = ["ALL"]
  }
  security_opts = local.hardened_security_opts
  wait          = true
  wait_timeout  = 60
  log_driver    = "json-file"
  log_opts      = local.log_opts

  dynamic "labels" {
    for_each = merge(local.labels, { "com.smartcommerce.service" = "frontend" })
    content {
      label = labels.key
      value = labels.value
    }
  }

  depends_on = [docker_container.backend]
}
