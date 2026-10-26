# ADR-0016: Staging en Oracle Cloud Always Free con imágenes multiarquitectura

- **Estado:** Reemplazado en el host por [ADR-0017](0017-staging-azure.md) (no se pudo crear la VM en Oracle). Las imágenes multiarquitectura siguen vigentes.
- **Fecha:** 2026-10-25

## Contexto

El despliegue automático a staging (ADR-0015) estaba implementado, pero sin un host real: el job `deploy-staging` fallaba al no tener a qué conectarse. La EP2 exige una versión desplegada en staging y accesible durante la demostración. El equipo no tiene presupuesto para infraestructura, y el stack completo (PostgreSQL, NestJS, FastAPI y Nginx, además del despliegue con Terraform) necesita al menos 2 vCPU y 4 GB de RAM.

## Decisión

- Usar una VM **Oracle Cloud Always Free** en la región Chile Central (Santiago): forma `VM.Standard.A1.Flex` con 2 OCPU y 12 GB, y Ubuntu 24.04. No tiene costo y está cerca de los usuarios.
- Esa forma usa procesadores **Ampere (ARM64)**. El pipeline construye cada imagen de forma **nativa** en runners amd64 y arm64, escanea ambas variantes con Trivy y publica en GHCR un **manifiesto multiarquitectura**: Docker descarga en cada máquina la variante que corresponde. Se publican exactamente las imágenes escaneadas, sin reconstruirlas.
- La preparación del host está en código (`infra/staging/bootstrap-oracle.sh`, hoy [`bootstrap-host.sh`](../../infra/staging/bootstrap-host.sh)): Docker, usuario `deploy` con llave dedicada, SSH sin contraseñas, apertura de 80 y 443 en el iptables propio de las imágenes de Oracle y **Caddy** como proxy TLS con certificado automático.
- Sin dominio propio, la URL es `https://<ip-con-guiones>.sslip.io`: un DNS público que resuelve a la IP indicada en el nombre, válido para Let's Encrypt.

## Alternativas

| Alternativa | Por qué no |
|---|---|
| Azure for Students | Requiere correo institucional verificado y el crédito se agota en pocos meses con una VM de 4 GB |
| VM x86 gratuita (Oracle E2.1.Micro, GCP e2-micro) | 1 GB de RAM, insuficiente para el stack |
| Render, Railway u otro PaaS gratuito | Servicios que se suspenden por inactividad, base de datos con vencimiento y sin Terraform con el proveedor Docker: obligaría a rediseñar el despliegue |
| Usar el equipo de un integrante con un túnel | Depende de que ese equipo esté encendido, y un runner autohospedado en un repositorio público permitiría ejecutar código ajeno en él |
| Emular arm64 con QEMU en el build | Mucho más lento (el build de Angular pasa de minutos a decenas de minutos); los runners arm64 nativos son gratuitos para repositorios públicos |

## Consecuencias

- (+) Staging permanente y gratuito, con la misma definición de Terraform y el mismo flujo de verificación y rollback.
- (+) Las imágenes quedan listas también para otras máquinas ARM (por ejemplo, equipos Apple Silicon del equipo).
- (−) El pipeline construye y escanea seis imágenes en vez de tres; corren en paralelo, así que el tiempo total casi no cambia.
- (−) La capacidad de las VM Ampere gratuitas es limitada y a veces Oracle no tiene disponibilidad al crearla; se documenta cómo reintentar.
- (−) sslip.io es un servicio externo para el nombre: si en el futuro hay dominio propio, basta con apuntarlo a la IP y cambiar `STAGING_URL` y el Caddyfile.
