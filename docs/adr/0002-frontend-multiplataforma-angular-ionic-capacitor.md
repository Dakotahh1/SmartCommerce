# ADR-0002: Frontend multiplataforma con Angular standalone, Ionic y Capacitor

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

El enunciado obliga a usar Angular, TypeScript, Ionic y Capacitor y a ejecutar la app en navegador, PWA y Android desde una base de código común. Los consumidores usan la app en la tienda (móvil, conectividad variable) y en casa (escritorio).

## Decisión

- **Angular 22 con componentes standalone** (sin NgModules), rutas *lazy* por funcionalidad y separación `core/` (auth, interceptores, guards, red), `shared/` (componentes de presentación, modelos, pipes), `features/` (páginas) y `services/` (acceso a la API).
- **Signals** para estado local y de sesión; **RxJS** para flujos HTTP.
- **Ionic 9** (`@ionic/angular/standalone`) para componentes y navegación: pestañas en móvil y `ion-split-pane` con menú lateral desde 992 px.
- **Capacitor 8** con plataforma Android y plugins justificados: `Preferences` (almacenamiento de sesión), `Network` (modo sin conexión), `App`, `StatusBar`, `SplashScreen`. Sin cámara ni geolocalización en EP1 (minimización de datos).
- **PWA** con `@angular/service-worker`: manifiesto, íconos, caché de assets y lecturas de catálogo/recomendaciones.
- Tokens visuales del [Design System en Figma](https://www.figma.com/design/vUBipEZdpxUtfokgU17hKu) mapeados a variables CSS de Ionic.

## Alternativas consideradas

- **Ionic con NgModules**: más código repetitivo; Angular recomienda standalone.
- **Angular Material + PWA sin Ionic**: incumple el enunciado y carece de navegación móvil nativa.
- **Almacenar tokens en cookies httpOnly**: más seguro frente a XSS en web, pero complejo en Capacitor (WebView con origen `https://localhost`); se mitiga XSS con CSP y escape de Angular (ver ADR-0007).

## Consecuencias

- (+) Una base de código para web, PWA y Android.
- (+) Navegación y densidad de información adaptadas por plataforma.
- (−) Las pruebas de componentes Ionic requieren configurar el entorno de pruebas (web components).
