# Configuración NO sensible del ambiente staging (versionada). Los secretos llegan por TF_VAR_*.
runtime_env         = "staging"
app_version         = "0.1.0"
image_registry      = "ghcr.io/dakotahh1/smartcommerce"
image_tag           = "main"
keep_images_locally = false

# Nginx publica solo en loopback: un proxy TLS del host (Caddy o Nginx) expone HTTPS al exterior.
frontend_bind_ip = "127.0.0.1"
frontend_port    = 8080
cors_origins     = ["https://staging.smartcommerce.example", "https://localhost"]
swagger_enabled  = true
off_user_agent   = "SmartCommerce-staging/0.1.0 (contacto: equipo@smartcommerce.example)"

resources = {
  database       = { memory_mb = 1024, cpus = "1.0" }
  python_service = { memory_mb = 512, cpus = "1.0" }
  backend        = { memory_mb = 512, cpus = "1.0" }
  frontend       = { memory_mb = 128, cpus = "0.5" }
}
