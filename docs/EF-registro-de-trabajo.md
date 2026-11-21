# Registro de trabajo · Entrega Final

> **SmartCommerce, versión final.** Este documento relaciona cada criterio de la rúbrica de la entrega final con su evidencia en el repositorio, el pipeline y el staging. Versión entregada: tag `v1.0.0` · staging: https://57-156-69-73.sslip.io · 21-11-2026.
>
> Leyenda: ✅ cumplido y verificado · 🟡 parcial, con la limitación explicada

## 1. Rúbrica de la entrega final

| # | Criterio (peso) | Estado | Evidencia |
|---|---|---|---|
| 1 | Problema, valor y alcance (8 %) | ✅ | [docs/01](01-definicion-proyecto.md): problema, personas de referencia y objetivos; estado de cada objetivo en §2; alcance, exclusiones y limitaciones en el README §13 |
| 2 | Arquitectura e integración técnica (12 %) | ✅ | [docs/02](02-arquitectura.md) y [ADR 0001–0017](adr/README.md); contratos OpenAPI versionados ([docs/api](api/README.md)) que el pipeline verifica, respuestas de Python validadas con zod; timeouts, reintentos, circuit breaker y orden base de respaldo ([ADR-0008](adr/0008-comunicacion-interna-rest-resiliente.md), `scripts/resilience-test.sh`) |
| 3 | Frontend multiplataforma, UX y accesibilidad (10 %) | ✅ / 🟡 | Navegador y PWA en el staging (service worker y caché de las últimas recomendaciones sin conexión); APK Android que usa el staging (§3.3); diseño adaptable; reglas de accesibilidad de ESLint en el pipeline. Falta una auditoría WCAG con usuarios |
| 4 | Backend, API, persistencia y control de acceso (10 %) | ✅ | JWT de 15 minutos y refresh opaco rotativo que revoca la sesión si se reutiliza ([ADR-0007](adr/0007-autenticacion-jwt-refresh-rotativo.md)); roles con 403 en el backend; validación de DTO; migraciones probadas arriba, abajo y arriba ([ADR-0004](adr/0004-postgresql-typeorm-migraciones.md)); transacción en la rotación de sesión; errores con formato uniforme; Swagger |
| 5 | Información web y calidad del procesamiento (10 %) | ✅ | [docs/04](04-fuente-web.md) y [docs/10](10-recuperacion-y-evaluacion.md): ingesta programada cada 6 horas, 95 % de registros válidos, 0 % de duplicados, procedencia en cada producto y manejo de la caída de la fuente |
| 6 | Capacidad adaptativa (15 %) | ✅ | [docs/05](05-motor-smartmatch.md) y [docs/11](11-evaluacion-adaptativa.md): filtros por reglas (incluidas las trazas), puntaje explicable, aprendizaje acotado, control del usuario, sesgos y privacidad. P@5 +29 % sobre la versión base y cero restricciones violadas |
| 7 | Pruebas y evaluación del sistema (10 %) | ✅ | 46 pruebas de frontend, 84 de backend, 12 de integración con PostgreSQL y 142 de Python (97,7 % de cobertura); pruebas entre contenedores en el staging efímero; evaluaciones del buscador y del motor como compuertas del pipeline; limitaciones en [docs/11 §11.5](11-evaluacion-adaptativa.md#115-limitaciones) |
| 8 | DevSecOps, contenedores, IaC y despliegue (12 %) | ✅ | [docs/07](07-pipeline-devsecops.md) y [docs/09](09-staging-terraform.md): quality gates con bloqueo real del 21-11 (Trivy detuvo Nginx con vulnerabilidades críticas), imágenes multiarquitectura no root con SBOM, Terraform, despliegue automático al staging, versión identificable en /api/health y rollback probado (§3.5) |
| 9 | Observabilidad, seguridad, privacidad y ética (8 %) | ✅ | Logs JSON con X-Request-Id entre servicios, /api/health con base de datos, motor y fuente, latencia p95 por ruta, alertas de calidad de datos; [docs/06](06-seguridad-privacidad.md): STRIDE, datos personales, eliminación de cuenta y sesgos |
| 10 | Documentación, reproducibilidad y colaboración (5 %) | ✅ / 🟡 | README, docs 01 a 11, ADR y los registros de la EP2 y de esta entrega; el historial muestra el trabajo por pull request, con aportes desiguales entre integrantes |

## 2. Objetivos del proyecto

| Objetivo ([docs/01 §1.10](01-definicion-proyecto.md#110-objetivos)) | Indicador | Resultado |
|---|---|---|
| OE1 · Arquitectura integrada | Diagramas, ADR y flujo completo con Docker Compose | ✅ desde la EP1 |
| OE2 · Pipeline DevSecOps | Bloquea pruebas fallidas, secretos y vulnerabilidades | ✅ bloqueo real el 21-11 ([docs/07 §7.5](07-pipeline-devsecops.md#75-evidencia-de-bloqueo)) |
| OE3 · Datos de Open Food Facts | ≥ 90 % válidos, < 5 % duplicados, procedencia en 100 % | ✅ 95 % válidos, 0 % duplicados, procedencia en todos |
| OE4 · SmartMatch personalizado y explicable | P@5 personalizada ≥ 20 % sobre la versión base | ✅ +29,0 % (0,517 → 0,667) |
| OE5 · Staging con rollback | Despliegue automático, salud y rollback demostrado | ✅ §3.5 |
| OE6 · Evaluación con usuarios | Éxito ≥ 80 %, comprensión ≥ 4/5, WCAG AA | 🟡 protocolo listo ([docs/11 §11.7](11-evaluacion-adaptativa.md#117-prueba-con-usuarios-protocolo)), aún no aplicado |

## 3. Qué se hizo para la entrega final

### 3.1 Staging real en Azure · PR #86, #87 y #88

La VM gratuita de Oracle no se pudo crear, así que el staging quedó en Azure (`Standard_B2als_v2`, Chile Central) con la misma definición de Terraform ([ADR-0017](adr/0017-staging-azure.md)). El script de preparación ahora sirve para cualquier nube. El despliegue acepta la llave SSH en base64 y la valida sin mostrarla, porque el formulario de secretos de GitHub perdía sus saltos de línea.

### 3.2 Evaluación del motor adaptativo · PR #115

Con 197 productos reales y las personas de referencia, la estrategia adaptativa supera a la versión base: P@5 +29 %, nDCG@10 +41 %, y las restricciones violadas bajan de 12 a 0. La evaluación encontró dos debilidades que se corrigieron: las trazas de alérgenos no llegaban al motor, y un producto sin aptitud de dieta verificada competía igual que uno verificado. Corre en cada pipeline como compuerta ([docs/11](11-evaluacion-adaptativa.md)).

### 3.3 App Android con el staging · PR #116

El pipeline publica dos APK: una para el emulador local y otra que usa el staging por HTTPS, para instalar en un celular real durante la demostración.

### 3.4 Mantenimiento de seguridad del 21-11 · PR #88

El pipeline bloqueó por hallazgos publicados esa semana: opentelemetry-api (pip-audit) y seis vulnerabilidades de Nginx 1.30.6, cuatro críticas (Trivy). Se actualizó a 1.30.7 desde el repositorio firmado de nginx.org. La causa de fondo era que la capa de parches del sistema quedaba en la caché de Docker: ahora se renueva a diario.

### 3.5 Despliegue automático y rollback probados en el staging

El 21-11 se probaron en el staging real el despliegue automático y el rollback; cada paso verificó la salud con la versión exacta, las pruebas de humo y la lectura del catálogo:

| Ejecución | Qué hizo | Versión resultante |
|---|---|---|
| [CI 44932267918](https://github.com/Dakotahh1/SmartCommerce/actions/runs/44932267918) (intento 2) | Primer despliegue automático desde main | 0.2.0+sha-8a899c680452 |
| [CI 44949711188](https://github.com/Dakotahh1/SmartCommerce/actions/runs/44949711188) | Despliegue automático tras mezclar el PR #116 | 0.2.0+sha-5d4e0d144a06 |
| [Rollback staging 44950518094](https://github.com/Dakotahh1/SmartCommerce/actions/runs/44950518094) | Rollback manual a la versión anterior, verificado | 0.2.0+sha-8a899c680452 |
| [CI 44950703418](https://github.com/Dakotahh1/SmartCommerce/actions/runs/44950703418) | Despliegue automático tras mezclar el PR #117 (versión entregada) | 0.2.0+sha-7839a089e2c6 |

Los datos sobreviven a cada cambio de versión porque PostgreSQL usa un volumen persistente: tras el rollback el catálogo siguió con sus productos. Los primeros intentos de despliegue ([40248129976](https://github.com/Dakotahh1/SmartCommerce/actions/runs/40248129976) y [40249671670](https://github.com/Dakotahh1/SmartCommerce/actions/runs/40249671670)) se detuvieron antes de aplicar nada porque la llave SSH no era válida: un despliegue que no puede verificarse no toca el staging.

### 3.6 Ingesta ante una fuente intermitente · PR #117

En el primer despliegue, la búsqueda de Open Food Facts respondió 503 de forma intermitente a la IP de Azure y el lote inicial quedó vacío. El resto del sistema no se vio afectado: /api/health siguió en ok y el error quedó registrado. Se subieron los reintentos del staging de 2 a 5 (`off_max_retries` en Terraform), y el catálogo del staging tiene 244 productos reales.

## 4. Demostración final

Los ocho puntos que pide el enunciado, todos en el staging:

| # | Escenario | Dónde |
|---|---|---|
| 1 | Funcionamiento normal | Explorar, búsqueda por relevancia y detalle con procedencia |
| 2 | Capacidad adaptativa | Para ti con el perfil de una persona, «Por qué te lo recomendamos», «No me interesa» y personalización apagada |
| 3 | Información web | Administración › Ingesta de datos y Calidad de datos |
| 4 | Pipeline | GitHub Actions: la ejecución que desplegó la versión entregada |
| 5 | Pruebas automatizadas | Resumen de esa ejecución: evaluación del motor y del buscador |
| 6 | Controles de seguridad | Ruta de administración rechazada (401/403) y el bloqueo de Trivy del 21-11 |
| 7 | Salud y métricas | /api/health con la versión desplegada y Administración › Estado del sistema |
| 8 | Degradación controlada | Se detiene el servicio Python: la app sigue con el orden base y avisa |

## 5. Limitaciones y trabajo futuro

- Sin precios: Open Food Facts casi no los tiene en Chile, así que el criterio de precio no influye (cobertura 0 %).
- Pocos productos declaran su aptitud vegana, lo que limita las recomendaciones para esa dieta.
- La evaluación usa personas de referencia; la prueba con usuarios (OE6) queda como protocolo.
- El staging es una sola VM, sin respaldo programado de PostgreSQL.
- Las bebidas alcohólicas pueden aparecer en la categoría bebidas; no recomendarlas por defecto queda como trabajo futuro.
