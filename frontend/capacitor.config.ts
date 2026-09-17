import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Empaquetado móvil (Android). El build `android` usa environment.android.ts, que apunta al
 * gateway local vía 10.0.2.2 (emulador). Para dispositivos reales se usa la URL de staging (HTTPS).
 */
// El build `android` de desarrollo consume http://10.0.2.2:8080 desde https://localhost:
// requiere habilitar tráfico en claro explícitamente (CAP_ALLOW_CLEARTEXT=true). Nunca en releases.
const allowCleartext = process.env['CAP_ALLOW_CLEARTEXT'] === 'true';

const config: CapacitorConfig = {
  appId: 'cl.smartcommerce.app',
  appName: 'SmartCommerce',
  webDir: 'dist/frontend/browser',
  android: {
    allowMixedContent: allowCleartext,
    webContentsDebuggingEnabled: allowCleartext,
  },
  server: {
    androidScheme: 'https',
    cleartext: allowCleartext,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0E1020',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#3A22C9',
    },
  },
};

export default config;
