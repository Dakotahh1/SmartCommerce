#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Prepara una VM Linux (Ubuntu 24.04, x86 o ARM) como host de staging. Se usa en Azure
# (Standard_B2als_v2) y sirve también para Oracle Cloud u otra nube con Ubuntu.
# Es idempotente: se puede volver a ejecutar sin romper una instalación existente.
#
#   1. Actualizaciones de seguridad automáticas.
#   2. Memoria swap de 2 GB si la VM no tiene: con 4 GB de RAM evita que un pico de memoria
#      (por ejemplo, de PostgreSQL) haga que el sistema detenga contenedores.
#   3. Docker Engine desde el repositorio oficial de Docker.
#   4. Usuario `deploy` sin contraseña, solo con la llave del pipeline, en el grupo docker.
#   5. SSH solo con llaves y sin acceso directo de root.
#   6. Firewall del sistema: algunas imágenes (Oracle Cloud) traen iptables que rechazan todo
#      salvo SSH; si existe esa regla REJECT, se abren 80 y 443 antes de ella y se persisten.
#      El firewall de la nube (NSG en Azure, Security List en Oracle) se configura aparte.
#   7. Caddy como proxy TLS: obtiene y renueva el certificado de Let's Encrypt y reenvía al
#      gateway de la aplicación, que solo escucha en 127.0.0.1:8080.
#   8. Carpeta privada para el estado de Terraform (scripts/deploy-staging.sh).
#
# Uso (desde el equipo del administrador; el usuario es azureuser en Azure y ubuntu en Oracle):
#   ssh -i ~/.ssh/smartcommerce_staging_admin <usuario>@<ip> \
#     "sudo bash -s -- <dominio> '$(cat ~/.ssh/smartcommerce_staging_deploy.pub)'" \
#     < infra/staging/bootstrap-host.sh
#
# <dominio>: nombre que apunta a la IP pública. Sin dominio propio sirve <ip-con-guiones>.sslip.io
# (por ejemplo 144-22-10-20.sslip.io), que resuelve a esa IP sin configurar DNS.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMINIO="${1:?Uso: bootstrap-host.sh <dominio> <llave-publica-del-pipeline>}"
LLAVE_DEPLOY="${2:?Falta la llave pública del usuario deploy}"
USUARIO=deploy
export DEBIAN_FRONTEND=noninteractive

paso() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Ejecutar con sudo." >&2
  exit 1
fi
if [[ ! "$LLAVE_DEPLOY" =~ ^ssh-(ed25519|rsa)\  ]]; then
  echo "La llave del pipeline no parece una llave pública SSH." >&2
  exit 1
fi

paso "Actualizaciones del sistema y parches de seguridad automáticos"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg debian-keyring debian-archive-keyring \
  apt-transport-https unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

paso "Memoria swap"
if [[ -z "$(swapon --show --noheadings)" ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  # La swap es un respaldo ante picos, no memoria de trabajo.
  echo 'vm.swappiness=10' >/etc/sysctl.d/60-smartcommerce-swap.conf
  sysctl -q -p /etc/sysctl.d/60-smartcommerce-swap.conf
fi
swapon --show

paso "Docker Engine (repositorio oficial)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091 # archivo del sistema, solo existe en el host
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
systemctl enable --now docker
# Rotación de logs de los contenedores para que no llenen el disco.
if [[ ! -f /etc/docker/daemon.json ]]; then
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' \
    >/etc/docker/daemon.json
  systemctl restart docker
fi

paso "Usuario $USUARIO (solo llave, grupo docker)"
id "$USUARIO" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$USUARIO"
usermod -aG docker "$USUARIO"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
printf '%s\n' "$LLAVE_DEPLOY" >"/home/$USUARIO/.ssh/authorized_keys"
chown "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh/authorized_keys"
chmod 600 "/home/$USUARIO/.ssh/authorized_keys"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/smartcommerce" "/home/$USUARIO/smartcommerce/terraform"

paso "SSH solo con llaves y sin root"
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' \
  >/etc/ssh/sshd_config.d/60-smartcommerce.conf
sshd -t
systemctl reload ssh

paso "Firewall del sistema"
posicion="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
if [[ -n "$posicion" ]]; then
  apt-get install -yq iptables-persistent
  for puerto in 80 443; do
    if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT 2>/dev/null; then
      iptables -I INPUT "$posicion" -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT
    fi
  done
  netfilter-persistent save
  echo "Abiertos 80 y 443 antes de la regla REJECT (posición $posicion)."
else
  echo "Sin regla REJECT en iptables: el filtrado lo hace el firewall de la nube."
fi

paso "Caddy (HTTPS automático) para $DOMINIO"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi
cat >/etc/caddy/Caddyfile <<EOF
# Generado por infra/staging/bootstrap-host.sh
$DOMINIO {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"
	reverse_proxy 127.0.0.1:8080
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy
systemctl reload-or-restart caddy

paso "Listo"
echo "Docker:  $(docker --version)"
echo "Caddy:   $(caddy version | cut -d' ' -f1)"
echo "Arquitectura: $(dpkg --print-architecture)"
echo "URL de staging: https://$DOMINIO"
echo "Huella del host (para STAGING_SSH_KNOWN_HOSTS): ssh-keyscan -t ed25519 <ip>"
