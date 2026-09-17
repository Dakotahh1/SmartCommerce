output "frontend_url" {
  description = "URL del gateway web en el host."
  value       = module.smartcommerce.frontend_url
}

output "health_url" {
  description = "Endpoint de salud para pruebas de humo."
  value       = module.smartcommerce.health_url
}

output "networks" {
  description = "Redes y si son internas."
  value       = module.smartcommerce.networks
}

output "database_volume" {
  description = "Volumen persistente de PostgreSQL."
  value       = module.smartcommerce.database_volume
}

output "containers" {
  description = "Contenedores por servicio."
  value       = module.smartcommerce.containers
}

output "images" {
  description = "Imágenes desplegadas."
  value       = module.smartcommerce.images
}
