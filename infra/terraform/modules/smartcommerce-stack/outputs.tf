output "frontend_url" {
  description = "URL local del gateway web en el host (exponer con un proxy TLS para acceso externo)."
  value       = "http://${var.frontend_bind_ip}:${var.frontend_port}"
}

output "health_url" {
  description = "Endpoint de salud agregada de la API (usado por las pruebas de humo)."
  value       = "http://${var.frontend_bind_ip}:${var.frontend_port}/api/health"
}

output "networks" {
  description = "Redes creadas y si son internas (sin salida a Internet)."
  value = {
    for n in [docker_network.edge, docker_network.api, docker_network.services, docker_network.data, docker_network.egress] :
    n.name => { internal = n.internal }
  }
}

output "database_volume" {
  description = "Volumen persistente de PostgreSQL."
  value       = docker_volume.db_data.name
}

output "containers" {
  description = "Nombres de los contenedores por servicio."
  value = {
    database       = docker_container.database.name
    migrate        = docker_container.migrate.name
    python_service = docker_container.python_service.name
    backend        = docker_container.backend.name
    frontend       = docker_container.frontend.name
  }
}

output "images" {
  description = "Imágenes desplegadas (etiquetas inmutables)."
  value       = merge(local.images, { database = var.postgres_image })
}
