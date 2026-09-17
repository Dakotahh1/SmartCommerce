/**
 * Build para Android (Capacitor). La WebView sirve la app desde https://localhost, por lo que
 * la API debe ser absoluta. 10.0.2.2 es el host del emulador de Android (Docker Compose local);
 * para staging se reemplaza por la URL pública del ambiente.
 */
export const environment = {
  production: true,
  apiUrl: 'http://10.0.2.2:8080/api',
  appVersion: '0.1.0',
};
