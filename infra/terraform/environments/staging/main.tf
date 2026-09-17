# Ambiente staging: VM Linux con Docker (host remoto vía SSH) que ejecuta las imágenes publicadas en GHCR.
provider "docker" {
  host     = var.docker_host
  ssh_opts = var.docker_ssh_opts
}

module "smartcommerce" {
  source = "../../modules/smartcommerce-stack"

  environment         = "staging"
  runtime_env         = var.runtime_env
  app_version         = var.app_version
  image_registry      = var.image_registry
  image_tag           = var.image_tag
  keep_images_locally = var.keep_images_locally
  frontend_bind_ip    = var.frontend_bind_ip
  frontend_port       = var.frontend_port
  cors_origins        = var.cors_origins
  swagger_enabled     = var.swagger_enabled
  off_user_agent      = var.off_user_agent
  resources           = var.resources

  postgres_superuser_password = var.postgres_superuser_password
  db_owner_password           = var.db_owner_password
  db_app_password             = var.db_app_password
  jwt_access_secret           = var.jwt_access_secret
  internal_api_token          = var.internal_api_token
}
