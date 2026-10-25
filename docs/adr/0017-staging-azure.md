# ADR-0017: Staging en una VM de Azure

- **Estado:** Aceptado (reemplaza el host de [ADR-0016](0016-staging-oracle-cloud-arm.md); se mantienen sus imágenes multiarquitectura)
- **Fecha:** 2026-10-25

## Contexto

El ADR-0016 eligió una VM gratuita de Oracle Cloud (Ampere, ARM64) para el staging de la EP2. Al crearla, Oracle no permitió completar la instancia, y la entrega necesita un staging accesible durante la demostración. El despliegue (Terraform con el proveedor Docker por SSH, verificación y rollback de [ADR-0015](0015-despliegue-staging-rollback.md)) no depende de la nube: basta una VM Linux con Docker.

## Decisión

- Usar una VM de **Azure** en la región **Chile Central** (Santiago): tamaño `Standard_B2als_v2` (2 vCPU AMD, 4 GB de RAM, 30 GB de disco) con Ubuntu 24.04, usuario administrador `azureuser` y acceso solo por llave SSH.
- Preparar el host con [`infra/staging/bootstrap-host.sh`](../../infra/staging/bootstrap-host.sh), que deja de ser específico de Oracle: Docker, usuario `deploy`, SSH sin contraseñas, **2 GB de swap** (la VM tiene 4 GB para PostgreSQL, NestJS, FastAPI y Nginx) y Caddy con HTTPS automático. El ajuste de iptables solo se aplica en imágenes que traen una regla REJECT (Oracle); en Azure filtra el **Network Security Group**, con entrada solo a 22, 80 y 443.
- URL pública: `https://57-156-69-73.sslip.io` (sslip.io resuelve el nombre a la IP; el certificado lo emite Let's Encrypt).
- Las imágenes siguen publicándose para amd64 y arm64 (ADR-0016): esta VM descarga la variante amd64, y volver a un host ARM no requiere cambios.

## Alternativas

| Alternativa | Por qué no |
|---|---|
| Insistir con Oracle Cloud Always Free | No se pudo crear la instancia; sin fecha cierta de disponibilidad para la entrega |
| VM de 1 GB (Azure B1s, GCP e2-micro) | Insuficiente para el stack completo, incluso con swap |
| PaaS gratuitos (Render, Railway) | Suspenden por inactividad, la base de datos vence y no admiten Terraform con el proveedor Docker |

## Consecuencias

- (+) Staging disponible con el mismo Terraform, la misma verificación y el mismo rollback, y en la misma región que los usuarios.
- (+) El script de preparación ahora sirve para cualquier nube con Ubuntu 24.04.
- (−) A diferencia de Oracle Always Free, la VM consume crédito de la suscripción de Azure: se puede **detener (desasignar)** fuera de los periodos de revisión y volver a encenderla antes de la demostración. La IP pública de Azure (SKU Standard) es estática y se conserva al detener la VM, así que no cambian la URL ni la huella SSH configuradas en GitHub; si se elimina la VM o su IP, hay que volver a configurarlas.
- (−) 4 GB de RAM es el mínimo cómodo para el stack: la swap cubre picos, no uso sostenido.
