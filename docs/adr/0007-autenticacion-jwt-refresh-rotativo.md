# ADR-0007: JWT de corta duración con refresh token opaco rotativo y RBAC

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

Se requiere inicio y cierre de sesión, almacenamiento seguro de contraseñas, expiración de tokens, protección de rutas, manejo de sesiones expiradas y autorización por roles, funcionando en navegador, PWA y Android (Capacitor).

## Decisión

- Contraseñas con **Argon2id** (`argon2`, parámetros por defecto OWASP: memoria 19 MiB, 2 iteraciones).
- **Access token JWT HS256** de 15 minutos con `sub`, `role`, `iss=smartcommerce-api`, `aud=smartcommerce-app`.
- **Refresh token opaco** (256 bits aleatorios, base64url) de 7 días; se guarda solo su **hash SHA-256**. Cada uso lo **rota**; reutilizar uno ya rotado revoca toda la familia (detección de robo).
- **Logout** revoca la familia del refresh token presentado.
- **RBAC**: roles `admin`, `operator`, `user`; guard global JWT con `@Public()` para rutas abiertas y `RolesGuard` con `@Roles()`.
- Frontend: access token en memoria (signal), refresh token en `@capacitor/preferences`; el interceptor refresca una sola vez ante 401 y cierra sesión si falla.

## Alternativas consideradas

- **Sesiones con cookie httpOnly**: preferible contra XSS en web, pero requiere CSRF y es complejo con Capacitor; se reconsiderará para la versión web en EF.
- **Solo JWT de larga duración**: imposible revocar; mayor impacto ante robo.
- **Proveedor externo (Auth0, Keycloak)**: agrega dependencia y costo; el curso exige implementar autenticación.

## Consecuencias

- (+) Revocación efectiva y sesiones cortas.
- (+) Autorización verificable por pruebas automatizadas.
- (−) El refresh token en almacenamiento del dispositivo es vulnerable a XSS en web → CSP estricta, sin `innerHTML`, dependencias auditadas.
