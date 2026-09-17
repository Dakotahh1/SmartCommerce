/** Producción web/PWA: el frontend se sirve detrás de Nginx, que hace proxy de /api al backend. */
export const environment = {
  production: true,
  apiUrl: '/api',
  appVersion: '0.1.0',
};
