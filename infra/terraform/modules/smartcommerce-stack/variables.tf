# ─── Identificación del ambiente ──────────────────────────────────────────────

variable "environment" {
  description = "Nombre del ambiente (dev, staging). Se usa como prefijo de recursos y etiqueta."
  type        = string

  validation {
    condition     = contains(["dev", "staging"], var.environment)
    error_message = "environment debe ser dev o staging."
  }
}

variable "runtime_env" {
  description = "Modo de ejecución de los servicios dentro de contenedores (staging o production; production oculta /docs en FastAPI)."
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.runtime_env)
    error_message = "runtime_env debe ser staging o production (development requiere herramientas que no están en las imágenes)."
  }
}

variable "app_version" {
  description = "Versión de la aplicación reportada por /api/health."
  type        = string
  default     = "0.1.0"
}

# ─── Imágenes ─────────────────────────────────────────────────────────────────

variable "image_registry" {
  description = "Prefijo de las imágenes de la aplicación (p. ej. ghcr.io/dakotahh1/smartcommerce o smartcommerce para imágenes locales)."
  type        = string
}

variable "image_tag" {
  description = "Etiqueta inmutable de las imágenes a desplegar (sha-<commit> o versión)."
  type        = string

  validation {
    condition     = var.image_tag != "latest"
    error_message = "No se permite la etiqueta latest: use sha-<commit> o una versión."
  }
}

variable "postgres_image" {
  description = "Imagen de PostgreSQL (versión fija)."
  type        = string
  default     = "postgres:17.11-alpine3.24"
}

variable "keep_images_locally" {
  description = "Conserva las imágenes en el host al destruir (útil cuando se construyen localmente)."
  type        = bool
  default     = true
}

# ─── Exposición ───────────────────────────────────────────────────────────────

variable "frontend_bind_ip" {
  description = "IP del host donde se publica el gateway web. 127.0.0.1 = solo accesible localmente (detrás de un proxy TLS)."
  type        = string
  default     = "127.0.0.1"

  validation {
    condition     = can(cidrhost("${var.frontend_bind_ip}/32", 0))
    error_message = "frontend_bind_ip debe ser una dirección IPv4 válida."
  }
}

variable "frontend_port" {
  description = "Puerto del host para el gateway web (único puerto publicado)."
  type        = number
  default     = 8080

  validation {
    condition     = var.frontend_port >= 1024 && var.frontend_port <= 65535
    error_message = "frontend_port debe estar entre 1024 y 65535."
  }
}

variable "cors_origins" {
  description = "Orígenes permitidos por la API (lista)."
  type        = list(string)
}

variable "swagger_enabled" {
  description = "Publica la documentación OpenAPI en /api/docs."
  type        = bool
  default     = true
}

# ─── Base de datos ────────────────────────────────────────────────────────────

variable "db_name" {
  description = "Nombre de la base de datos."
  type        = string
  default     = "smartcommerce"
}

variable "db_owner_user" {
  description = "Rol dueño del esquema (solo migraciones)."
  type        = string
  default     = "smartcommerce_owner"
}

variable "db_app_user" {
  description = "Rol de la API (solo DML)."
  type        = string
  default     = "smartcommerce_app"
}

# ─── Fuente web ───────────────────────────────────────────────────────────────

variable "off_user_agent" {
  description = "User-Agent identificable exigido por Open Food Facts."
  type        = string
}

# ─── Recursos ─────────────────────────────────────────────────────────────────

variable "resources" {
  description = "Límites de memoria (MB) y CPU por servicio."
  type = map(object({
    memory_mb = number
    cpus      = string
  }))
  default = {
    database       = { memory_mb = 512, cpus = "1.0" }
    python_service = { memory_mb = 384, cpus = "1.0" }
    backend        = { memory_mb = 512, cpus = "1.0" }
    frontend       = { memory_mb = 128, cpus = "0.5" }
  }

  validation {
    condition     = alltrue([for k in ["database", "python_service", "backend", "frontend"] : contains(keys(var.resources), k)])
    error_message = "resources debe definir database, python_service, backend y frontend."
  }
}

# ─── Secretos (se inyectan con TF_VAR_* desde GitHub Secrets; nunca en archivos versionados) ───

variable "postgres_superuser_password" {
  description = "Contraseña del superusuario de PostgreSQL (solo inicialización)."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.postgres_superuser_password) >= 16
    error_message = "postgres_superuser_password debe tener al menos 16 caracteres."
  }
}

variable "db_owner_password" {
  description = "Contraseña del rol owner."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_owner_password) >= 16
    error_message = "db_owner_password debe tener al menos 16 caracteres."
  }
}

variable "db_app_password" {
  description = "Contraseña del rol app."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_app_password) >= 16
    error_message = "db_app_password debe tener al menos 16 caracteres."
  }
}

variable "jwt_access_secret" {
  description = "Secreto de firma de los JWT de acceso."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_access_secret) >= 32
    error_message = "jwt_access_secret debe tener al menos 32 caracteres."
  }
}

variable "internal_api_token" {
  description = "Token compartido NestJS → FastAPI."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.internal_api_token) >= 32
    error_message = "internal_api_token debe tener al menos 32 caracteres."
  }
}
