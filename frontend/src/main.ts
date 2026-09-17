import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { registerIcons } from './app/icons';

registerIcons();

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  // Error fatal de arranque: sin interfaz disponible para notificar.
  console.error(error);
});
