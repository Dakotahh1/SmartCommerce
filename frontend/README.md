# Frontend SmartCommerce (Angular + Ionic + Capacitor)

Aplicación **web (PWA)** y **móvil (Android)** desde una sola base de código. Consume exclusivamente la API NestJS (`/api/v1/*`); nunca se comunica directamente con el servicio Python ni con la base de datos.

- **Stack:** Angular 22 (standalone, zoneless, signals, OnPush) · Ionic 9 · Capacitor 8 · TypeScript 6 · Vitest · ESLint (angular-eslint) · Prettier
- **Prototipo Figma:** [SmartCommerce – Prototipos EP1](https://www.figma.com/design/vUBipEZdpxUtfokgU17hKu) (móvil M01–M09, escritorio D01–D03, design system)
- **Arquitectura general:** [docs/02-arquitectura.md](../docs/02-arquitectura.md) · **Seguridad:** [docs/06-seguridad-privacidad.md](../docs/06-seguridad-privacidad.md) · **ADR del frontend:** [ADR-0002](../docs/adr/0002-frontend-multiplataforma-angular-ionic-capacitor.md)

## Pantallas y rutas

| Ruta | Pantalla (Figma) | Acceso | Descripción |
|---|---|---|---|
| `/bienvenida` | M01 | Público | Propuesta de valor, primer ingreso |
| `/auth/login` · `/auth/registro` | M02 | Solo visitantes | Formularios reactivos validados; consentimiento explícito en el registro |
| `/onboarding/preferencias` | M03 | Autenticado | Pesos de criterios, dietas, alérgenos y sellos ALTO EN |
| `/app/inicio` | M04 · D01 | Público (personalizado con sesión) | Recomendaciones SmartMatch explicables; caché sin conexión y aviso de modo degradado |
| `/app/explorar` | M05 | Público | Búsqueda con filtros (Nutri-Score, NOVA, alérgenos, categorías) y scroll infinito |
| `/app/producto/:id` | M06 | Público | Detalle: puntaje por criterio, sellos, nutrientes, dietas y procedencia del dato |
| `/app/comparar` | M07 · D02 | Público | Comparación de 2 a 4 productos con ganador por criterio |
| `/app/perfil` | M08 | Autenticado | Preferencias, historial de interacciones, restablecer aprendizaje, eliminar cuenta |
| `/app/admin/ingesta` | D03 | `admin`, `operator` | Ejecuta y audita ingestas desde Open Food Facts |
| `/app/admin/estado` | D03 | `admin`, `operator` | Salud de servicios y métricas por ruta (latencia, errores) |

En pantallas ≥ 992 px la navegación pasa de barra inferior a **menú lateral** (`ion-split-pane`), igual que en los prototipos de escritorio. Los estados sin conexión y degradado (M09) se muestran como banners en el shell, Inicio y Comparar.

## Estructura

```
src/app/
├── app.config.ts            # router, HttpClient + interceptores, Ionic, service worker, inicialización
├── app.routes.ts            # rutas lazy con guards (auth, invitado, rol, bienvenida)
├── core/
│   ├── auth/                # AuthService (signals), guards
│   ├── http/interceptors.ts # X-Request-Id, Bearer + refresh único ante 401, errores normalizados
│   ├── api.service.ts       # único punto de acceso a la API REST
│   ├── compare.store.ts     # selección de comparación persistente (máx. 4)
│   ├── storage.service.ts   # Capacitor Preferences (SharedPreferences en Android, localStorage en web)
│   ├── network.service.ts   # estado de conexión (@capacitor/network)
│   └── native.ts            # status bar / splash solo en plataforma nativa
├── layout/shell.component   # split-pane, menú lateral, barra inferior, banner sin conexión
├── features/                # páginas por dominio (welcome, auth, home, explore, product, compare, profile, admin)
├── shared/                  # componentes del design system (match ring, Nutri-Score, sellos, tarjetas…) y etiquetas
└── testing/                 # utilidades de prueba
```

## Seguridad en el cliente

- **Access token solo en memoria**; el refresh token se guarda en Capacitor Preferences y **rota en cada uso**. Refrescos concurrentes comparten una sola solicitud para no disparar la detección de reutilización del backend.
- Ante un `401`, el interceptor refresca **una sola vez** y reintenta; si falla, limpia la sesión y redirige a login. Sin conexión, **no** borra la sesión (modo offline).
- Los guards de rol son solo de experiencia de usuario: **la API vuelve a validar roles** (defensa en profundidad).
- `returnUrl` solo acepta rutas internas (evita redirecciones abiertas). Sin `innerHTML` (`innerHTMLTemplatesEnabled: false` en Ionic).
- Nginx aplica **CSP estricta** (`script-src 'self'`, imágenes solo desde `images.openfoodfacts.org`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`. El build desactiva el CSS crítico en línea para no requerir scripts inline.
- Android: `allowBackup=false` (el token no viaja en respaldos) y tráfico en claro deshabilitado salvo build de desarrollo explícito.

## Requisitos

- Node.js `^22.22.3` o `>=24.15` (recomendado 24 LTS) y npm 11
- Para Android: Android Studio (SDK 36) y JDK 21

## Desarrollo local

```bash
npm ci
npm start            # http://localhost:4200 → API en http://localhost:3000/api (environment.development.ts)
```

La API debe permitir el origen en `CORS_ORIGINS` (por defecto `http://localhost:4200`). Con Docker Compose no hace falta CORS: el gateway Nginx sirve la app y hace proxy de `/api` en el mismo origen (ver README raíz).

| Script | Uso |
|---|---|
| `npm run lint` | ESLint + reglas de accesibilidad en plantillas |
| `npm run format:check` | Prettier |
| `npm run typecheck` | `tsc` de la app y de las pruebas |
| `npm test` / `npm run test:ci` | Vitest (modo watch / una ejecución con cobertura en `coverage/`) |
| `npm run build` | Build de producción en `dist/frontend/browser` (PWA con service worker) |
| `npm run build:android` | Build `android` + `cap sync android` |

## Configuración por ambiente

Angular inyecta la configuración en tiempo de build (`src/environments/`). **No contiene secretos**: solo la URL base de la API.

| Archivo | Build | `apiUrl` |
|---|---|---|
| `environment.development.ts` | `ng serve` | `http://localhost:3000/api` |
| `environment.ts` | `production` (Docker/staging) | `/api` (mismo origen, proxy Nginx) |
| `environment.android.ts` | `android` | `http://10.0.2.2:8080/api` (emulador → gateway local) |

Variables del contenedor (Nginx): `API_UPSTREAM` (por defecto `http://backend:3000`) y `DNS_RESOLVER` (por defecto `127.0.0.11`, DNS interno de Docker).

## Contenedor

```bash
docker build -t smartcommerce-frontend .
docker run --rm -p 8080:8080 -e API_UPSTREAM=http://host.docker.internal:3000 smartcommerce-frontend
```

Imagen multi-etapa: build con Node 24 Alpine y runtime `nginx-unprivileged` (usuario 101, puerto 8080, healthcheck en `/healthz`). Los recursos con hash se sirven con caché inmutable; `index.html`, `ngsw-worker.js` y el manifest con `no-cache` para que la PWA se actualice.

## Android (Capacitor)

```bash
npm run build:android               # compila y sincroniza assets en android/
npx cap open android                # abre Android Studio
# o por consola:
cd android && ./gradlew assembleDebug   # APK en android/app/build/outputs/apk/debug/
```

Para probar contra el Docker Compose local desde el emulador: `CAP_ALLOW_CLEARTEXT=true npm run build:android` (habilita HTTP hacia `10.0.2.2` solo en ese build). Íconos adaptativos, splash y colores usan los tokens de marca del prototipo.

## Pruebas

Vitest + TestBed (`src/**/*.spec.ts`):

- `AuthService`: login, restauración de sesión, refresh único concurrente, rechazo vs. sin conexión, logout.
- Interceptores: cabeceras solo hacia la API propia, reintento tras refresh, redirección a login, normalización de errores.
- Guards de autenticación, invitado y rol.
- `LoginPage`: validación accesible, normalización del correo, bloqueo de redirecciones abiertas, mensaje genérico ante credenciales inválidas.
- `ApiService` (contratos HTTP), `CompareStore` (límite y persistencia) y componentes del design system.
