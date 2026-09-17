# Configuración NO sensible del ambiente dev (Docker local con imágenes construidas con docker compose build).
runtime_env         = "staging"
app_version         = "0.1.0-dev"
image_registry      = "smartcommerce"
image_tag           = "local"
keep_images_locally = true

# Puerto distinto de Docker Compose (8080) para poder convivir en la misma máquina.
frontend_bind_ip = "127.0.0.1"
frontend_port    = 8081
cors_origins     = ["http://localhost:8081", "https://localhost"]
swagger_enabled  = true
off_user_agent   = "SmartCommerce-dev/0.1.0 (contacto: equipo@smartcommerce.example)"

resources = {
  database       = { memory_mb = 512, cpus = "1.0" }
  python_service = { memory_mb = 384, cpus = "1.0" }
  backend        = { memory_mb = 384, cpus = "1.0" }
  frontend       = { memory_mb = 96, cpus = "0.5" }
}
