/**
 * Build para Android que usa el staging (Capacitor). La WebView sirve la app desde
 * https://localhost, origen que el despliegue agrega a CORS junto con la URL pública. Va por HTTPS,
 * así que no necesita habilitar tráfico en claro. Si cambia la IP del staging, se actualiza aquí.
 */
export const environment = {
  production: true,
  apiUrl: 'https://57-156-69-73.sslip.io/api',
  appVersion: '0.2.0',
};
