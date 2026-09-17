import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor, errorInterceptor, requestIdInterceptor } from './core/http/interceptors';
import { initNativeShell } from './core/native';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIonicAngular({ innerHTMLTemplatesEnabled: false }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideRouter(routes, withComponentInputBinding()),
    // Orden: requestId → errores → auth (auth ve el 401 original y puede refrescar antes de normalizar)
    provideHttpClient(
      withFetch(),
      withInterceptors([requestIdInterceptor, errorInterceptor, authInterceptor]),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(async () => {
      await Promise.all([inject(AuthService).restoreSession(), initNativeShell()]);
    }),
  ],
};
