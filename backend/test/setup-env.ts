/**
 * Variables de entorno de las pruebas e2e. Se cargan ANTES de importar AppModule porque
 * la configuración se valida al construir el módulo. Los secretos son exclusivos de pruebas;
 * en CI se inyectan desde GitHub Actions Secrets o se generan de forma efímera.
 */
export const FAKE_PYTHON_PORT = Number(
  process.env.E2E_FAKE_PYTHON_PORT ?? 18765,
);

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'smartcommerce_test',
  DB_USER: 'postgres',
  DB_PASSWORD: 'postgres',
  PYTHON_SERVICE_URL: `http://127.0.0.1:${FAKE_PYTHON_PORT}`,
  INTERNAL_API_TOKEN: 'e2e-internal-token-0123456789abcdefghij',
  JWT_ACCESS_SECRET: 'e2e-jwt-secret-0123456789abcdefghijklmnop',
  SMARTMATCH_TIMEOUT_MS: '800',
  SMARTMATCH_MAX_RETRIES: '0',
  SMARTMATCH_BREAKER_THRESHOLD: '50',
  THROTTLE_ENABLED: 'false',
  SWAGGER_ENABLED: 'true',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
// La URL del servicio simulado siempre apunta al puerto de pruebas.
process.env.PYTHON_SERVICE_URL = `http://127.0.0.1:${FAKE_PYTHON_PORT}`;
process.env.LOG_LEVEL = 'silent';
