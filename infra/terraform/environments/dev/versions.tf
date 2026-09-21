terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }

  # El estado NUNCA se versiona (.gitignore excluye *.tfstate y .state/).
  # dev apunta al Docker local de cada integrante: basta un estado local fuera del control de versiones.
  backend "local" {
    path = "../../.state/dev.tfstate"
  }
}
