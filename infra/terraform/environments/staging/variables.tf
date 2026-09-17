# ─── Conexión con el host Docker ──────────────────────────────────────────────

variable "docker_host" {
  description = "Daemon Docker destino: unix:///var/run/docker.sock (runner de CI) o ssh://deploy@<ip> (VM de staging)."
  type        = string
  default     = "unix:///var/run/docker.sock"
}

variable "docker_ssh_opts" {
  description = "Opciones SSH adicionales cuando docker_host usa ssh:// (p. ej. -i ~/.ssh/staging)."
  type        = list(string)
  default     = []
}

# ─── Configuración no sensible (terraform.tfvars) ─────────────────────────────

variable "runtime_env" {
  description = "Modo de ejecución de los servicios (staging o production)."
  type        = string
  default     = "staging"
}

variable "app_version" {
  description = "Versión desplegada."
  type        = string
}

variable "image_registry" {
  description = "Prefijo de las imágenes."
  type        = string
}

variable "image_tag" {
  description = "Etiqueta inmutable de las imágenes (sha-<commit> o versión)."
  type        = string
}

variable "keep_images_locally" {
  description = "Conserva las imágenes al destruir."
  type        = bool
  default     = false
}

variable "frontend_bind_ip" {
  description = "IP del host donde se publica el gateway."
  type        = string
}

variable "frontend_port" {
  description = "Puerto del host para el gateway."
  type        = number
}

variable "cors_origins" {
  description = "Orígenes permitidos por la API."
  type        = list(string)
}

variable "swagger_enabled" {
  description = "Publica /api/docs."
  type        = bool
}

variable "off_user_agent" {
  description = "User-Agent para Open Food Facts."
  type        = string
}

variable "resources" {
  description = "Límites de memoria (MB) y CPU por servicio."
  type = map(object({
    memory_mb = number
    cpus      = string
  }))
}

# ─── Secretos: TF_VAR_<nombre> desde GitHub Secrets (ambiente staging) ────────

variable "postgres_superuser_password" {
  description = "Contraseña del superusuario de PostgreSQL."
  type        = string
  sensitive   = true
}

variable "db_owner_password" {
  description = "Contraseña del rol owner."
  type        = string
  sensitive   = true
}

variable "db_app_password" {
  description = "Contraseña del rol app."
  type        = string
  sensitive   = true
}

variable "jwt_access_secret" {
  description = "Secreto de firma JWT."
  type        = string
  sensitive   = true
}

variable "internal_api_token" {
  description = "Token interno NestJS → FastAPI."
  type        = string
  sensitive   = true
}
