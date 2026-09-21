terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }

  # El estado NUNCA se versiona (.gitignore excluye *.tfstate y .state/).
  # En CI se usa este backend local efímero solo para `plan`. Para un staging persistente
  # se reemplaza por un backend remoto con bloqueo e inicialización parcial, por ejemplo:
  #   backend "s3" {}   +   terraform init -backend-config=backend.hcl  (archivo fuera del repositorio)
  backend "local" {
    path = "../../.state/staging.tfstate"
  }
}
