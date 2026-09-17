# 6. Seguridad, privacidad y modelo de amenazas

> Enfoque DevSecOps: la seguridad se diseña desde EP1 y se verifica automáticamente en cada cambio.

## 6.1 Activos

| Activo | Sensibilidad |
|---|---|
| Credenciales de usuarios (hash de contraseñas, tokens) | Alta |
| Datos personales: correo, nombre, preferencias, dietas/alérgenos (pueden revelar condiciones de salud) e historial de interacciones | Alta |
| Secretos de infraestructura (JWT, contraseñas de BD, token interno, credenciales de despliegue) | Crítica |
| Catálogo normalizado y logs | Media |
| Disponibilidad de la API | Media |

## 6.2 Roles y permisos (RBAC)

| Recurso / operación | Visitante | `user` | `operator` | `admin` |
|---|:---:|:---:|:---:|:---:|
| `GET /api/v1/products`, `GET /api/v1/products/:id` | ✅ | ✅ | ✅ | ✅ |
| `POST /api/v1/auth/register`, `login`, `refresh` | ✅ | — | — | — |
| `GET /api/v1/auth/me`, `POST /auth/logout` | — | ✅ | ✅ | ✅ |
| `GET/PUT /api/v1/me/preferences` (solo las propias) | — | ✅ | ✅ | ✅ |
| `POST /api/v1/interactions` (solo como sí mismo) | — | ✅ | ✅ | ✅ |
| `GET /api/v1/recommendations` (personalizadas) | — | ✅ | ✅ | ✅ |
| `POST /api/v1/comparisons` | ✅ (base) | ✅ | ✅ | ✅ |
| `GET/POST /api/v1/admin/ingestions` | — | — | ✅ | ✅ |
| `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id/role` | — | — | — | ✅ |
| `GET /api/health` (resumen) | ✅ | ✅ | ✅ | ✅ |

Un token válido **no** implica acceso total: cada controlador declara `@Roles(...)` y los recursos personales se resuelven con el `sub` del token (nunca con un id enviado por el cliente).

## 6.3 Modelo de amenazas (STRIDE)

| Amenaza | Ejemplo en SmartCommerce | Controles |
|---|---|---|
| **S**uplantación | Robo de sesión, fuerza bruta de contraseñas | Argon2id; JWT de 15 min firmado (HS256, `iss`/`aud`); refresh opaco rotativo con detección de reutilización; *rate limit* estricto en `/auth/*`; mensajes de error genéricos en login |
| **T**ampering (manipulación) | Modificar `role` en el JWT o en el cuerpo de registro; inyección SQL | Firma verificada; DTO con `whitelist` + `forbidNonWhitelisted` (no se puede enviar `role`); TypeORM con consultas parametrizadas; validación Pydantic en Python |
| **R**epudio | Negar haber ejecutado una ingesta | `ingestion_runs.triggered_by` + logs estructurados con `requestId` y `userId` |
| **I**nformation disclosure | Trazas de error, secretos en logs, enumeración de usuarios | Filtro global de excepciones sin stack/SQL; redacción de `authorization`, `password`, `token` en Pino; respuestas genéricas; Helmet; CORS restringido |
| **D**enegación de servicio | Abuso de `/recommendations` o de ingestas que saturan la fuente externa | `@nestjs/throttler`; límites de tamaño de payload; límites `limit ≤ 50`, `pageSize ≤ 100`; timeouts y *circuit breaker* hacia Python; *rate limiter* hacia Open Food Facts |
| **E**levación de privilegios | Usuario `user` llamando a endpoints de administración | `RolesGuard` global; pruebas automatizadas de autorización (403); token interno obligatorio en Python; contenedores sin root y `no-new-privileges` |

**Amenazas específicas de integración**

- *Datos no validados enviados a Python*: NestJS valida y construye el payload desde la base de datos (el cliente nunca envía candidatos arbitrarios); Python vuelve a validar con Pydantic (defensa en profundidad).
- *Respuesta inválida de Python*: NestJS valida el contrato con `zod`; si falla, responde en modo degradado.
- *Datos maliciosos desde la fuente web* (XSS almacenado en nombres de productos): Pydantic limita longitudes, se eliminan caracteres de control y Angular escapa por defecto (sin `innerHTML`).
- *Cadena de suministro*: lockfiles (`package-lock.json`, `uv.lock`), `npm ci`/`uv sync --frozen`, Dependabot, `npm audit`, `pip-audit`, escaneo de imágenes y acciones de GitHub fijadas por SHA.

## 6.4 Gestión de secretos

- Ningún secreto en el código ni en imágenes: solo variables de entorno.
- Local: archivo `.env` ignorado por git (plantillas `.env.example` con valores ficticios).
- CI/CD: **GitHub Actions Secrets** para credenciales y **Variables** para configuración no sensible (ver [08-variables-y-secretos.md](08-variables-y-secretos.md)).
- Detección automática de secretos con **gitleaks** en cada push/PR (bloqueante).
- Rotación: los secretos de JWT y el token interno pueden rotarse sin migraciones (invalida sesiones activas).

## 6.5 Privacidad y datos personales

| Dato personal | Finalidad | Base | Retención | Control del usuario |
|---|---|---|---|---|
| Correo y nombre visible | Autenticación y comunicación | Consentimiento al registrarse | Mientras exista la cuenta | Editar / eliminar cuenta |
| Preferencias, dietas y alérgenos | Personalizar recomendaciones | Consentimiento explícito | Mientras exista la cuenta | Editar, desactivar personalización |
| Interacciones | Aprendizaje de preferencias y evaluación | Consentimiento; opt-out | 180 días | Ver historial, restablecer aprendizaje, eliminar |
| Registros de recomendación | Auditoría y evaluación | Interés legítimo | 180 días | Se eliminan con la cuenta |

Principios: **minimización** (no se pide RUT, dirección ni ubicación precisa), **transparencia** (pantalla "Perfil y transparencia"), **derecho de acceso y eliminación** (exportar y borrar datos; `ON DELETE CASCADE`), **sin venta ni cesión** a terceros, logs **sin** datos personales innecesarios (solo `userId`).

Alineado con la Ley 19.628 sobre protección de la vida privada y la Ley 21.719 de protección de datos personales de Chile.

## 6.6 Controles automáticos en el pipeline

Detalle de etapas y evidencias en [07-pipeline-devsecops.md](07-pipeline-devsecops.md).

| Control | Herramienta | Bloquea |
|---|---|---|
| Secretos en el repositorio (historial completo) | gitleaks (lista blanca mínima por valor exacto) | Sí, cualquier hallazgo |
| Análisis estático (SAST) | Semgrep CE (OWASP Top 10, TypeScript, Node.js, Python, Dockerfile, GitHub Actions, secretos) + Bandit + reglas de seguridad de Ruff y ESLint | Sí (Semgrep `ERROR`, Bandit severidad media o superior) |
| Dependencias vulnerables | `npm audit --audit-level=high`, `pip-audit` | Sí (altas y críticas) |
| Imágenes Docker | Trivy (CRITICAL y HIGH con parche disponible) + SBOM CycloneDX + verificación de usuario no root | Sí |
| Dockerfiles, scripts y workflows | Hadolint, ShellCheck, actionlint, `docker compose config` | Sí |
| Integración en staging efímero | Pruebas de humo con controles negativos (401/403/400), aislamiento de red y resiliencia | Sí |
| Infraestructura | `terraform fmt/validate/plan` | Sí |

## 6.7 Accesibilidad

Contraste AA verificado en el Design System, áreas táctiles ≥ 44 px, etiquetas `aria` en controles Ionic, foco visible, soporte de tamaño de texto del sistema y mensajes de estado anunciables (`role="status"`).
