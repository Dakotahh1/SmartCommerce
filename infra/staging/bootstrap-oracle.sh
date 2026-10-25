#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Prepara una VM de Oracle Cloud (Ubuntu 24.04, Ampere/ARM o x86) como host de staging.
# Es idempotente: se puede volver a ejecutar sin romper una instalación existente.
#
#   1. Actualizaciones de seguridad automáticas.
#   2. Docker Engine desde el repositorio oficial de Docker.
#   3. Usuario `deploy` sin contraseña, solo con la llave del pipeline, en el grupo docker.
#   4. SSH solo con llaves y sin acceso directo de root.
#   5. Firewall: las imágenes de Oracle traen iptables que rechazan todo salvo SSH; se abren
#      80 (validación del certificado) y 443 (HTTPS) antes de la regla REJECT y se persisten.
#   6. Caddy como proxy TLS: obtiene y renueva el certificado de Let's Encrypt y reenvía al
#      gateway de la aplicación, que solo escucha en 127.0.0.1:8080.
#   7. Carpeta privada para el estado de Terraform (scripts/deploy-staging.sh).
#
# Uso (desde el equipo del administrador):
#   ssh -i ~/.ssh/smartcommerce_staging_admin ubuntu@<ip> \
#     "sudo bash -s -- <dominio> '$(cat ~/.ssh/smartcommerce_staging_deploy.pub)'" \
#     < infra/staging/bootstrap-oracle.sh
#
# <dominio>: nombre que apunta a la IP pública. Sin dominio propio sirve <ip-con-guiones>.sslip.io
# (por ejemplo 144-22-10-20.sslip.io), que resuelve a esa IP sin configurar DNS.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMINIO="${1:?Uso: bootstrap-oracle.sh <dominio> <llave-publica-del-pipeline>}"
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
  apt-transport-https unattended-upgrades iptables-persistent
dpkg-reconfigure -f noninteractive unattended-upgrades

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

paso "Firewall: abrir 80 y 443 antes de la regla REJECT de Oracle"
for puerto in 80 443; do
  if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT 2>/dev/null; then
    posicion="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
    iptables -I INPUT "${posicion:-1}" -p tcp -m state --state NEW --dport "$puerto" -j ACCEPT
  fi
done
netfilter-persistent save

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
# Generado por infra/staging/bootstrap-oracle.sh
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
