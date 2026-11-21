#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Configura el acceso SSH del runner al host de staging (deploy y rollback).
#
#   SSH_KEY      llave privada del usuario deploy (secreto STAGING_SSH_PRIVATE_KEY). Se acepta en
#                texto (desde BEGIN hasta END) o codificada en base64 en una sola línea, que no
#                depende de cómo se peguen los saltos de línea en el formulario de GitHub.
#   KNOWN_HOSTS  huella del host (variable STAGING_SSH_KNOWN_HOSTS).
#
# Si la llave no es válida, falla con un diagnóstico que no revela su contenido: cuántas líneas
# llegaron, el largo de cada una y si traía retornos de carro de Windows.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ -z "${SSH_KEY:-}" || -z "${KNOWN_HOSTS:-}" ]]; then
  echo "::error::Falta el secreto STAGING_SSH_PRIVATE_KEY o la variable STAGING_SSH_KNOWN_HOSTS"
  exit 1
fi

install -m 700 -d ~/.ssh
KEY_FILE=~/.ssh/id_ed25519
umask 077

if [[ "$SSH_KEY" == *"-----BEGIN"* ]]; then
  # Texto pegado desde Windows: OpenSSH no acepta \r\n ("error in libcrypto").
  printf '%s\n' "$SSH_KEY" | tr -d '\r' >"$KEY_FILE"
else
  printf '%s' "$SSH_KEY" | tr -d ' \r\n' | base64 -d >"$KEY_FILE" 2>/dev/null || true
fi
chmod 600 "$KEY_FILE"
printf '%s\n' "$KNOWN_HOSTS" | tr -d '\r' >~/.ssh/known_hosts

if ! ssh-keygen -y -f "$KEY_FILE" >/dev/null 2>&1; then
  largos="$(awk '{ printf "%s%d", (NR > 1 ? "," : ""), length($0) }' "$KEY_FILE")"
  retornos="no"
  [[ "$SSH_KEY" == *$'\r'* ]] && retornos="sí"
  echo "::error::STAGING_SSH_PRIVATE_KEY no es una llave privada OpenSSH válida." \
    "Líneas: $(wc -l <"$KEY_FILE"); largo de cada línea: ${largos:-ninguna}; retornos de carro: $retornos." \
    "Una llave ed25519 suele tener 7 líneas; también se puede pegar codificada en base64 en una sola línea."
  exit 1
fi
echo "Llave del usuario deploy y huella del host configuradas."
