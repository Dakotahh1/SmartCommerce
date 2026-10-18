import { validateEnv } from './env.schema.js';

const base = {
  DB_HOST: 'database',
  DB_NAME: 'smartcommerce',
  DB_USER: 'smartcommerce_app',
  DB_PASSWORD: 'una-clave-larga',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  PYTHON_SERVICE_URL: 'http://python-service:8000',
  INTERNAL_API_TOKEN: 'y'.repeat(40),
};

describe('validateEnv', () => {
  it('aplica valores por defecto seguros', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      SWAGGER_ENABLED: false,
      THROTTLE_ENABLED: true,
      JWT_ACCESS_TTL_SECONDS: 900,
      DB_SSL: false,
    });
  });

  it('convierte booleanos y números desde strings', () => {
    const env = validateEnv({
      ...base,
      SWAGGER_ENABLED: 'true',
      DB_PORT: '5433',
      THROTTLE_ENABLED: 'false',
    });
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.THROTTLE_ENABLED).toBe(false);
    expect(env.DB_PORT).toBe(5433);
  });

  it('falla al arrancar si faltan secretos o son débiles', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'corto' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() =>
      validateEnv({ ...base, INTERNAL_API_TOKEN: undefined }),
    ).toThrow(/INTERNAL_API_TOKEN/);
    expect(() =>
      validateEnv({ ...base, PYTHON_SERVICE_URL: 'no-es-url' }),
    ).toThrow(/PYTHON_SERVICE_URL/);
  });

  it('la ingesta programada está desactivada por defecto y parsea los objetivos', () => {
    const env = validateEnv(base);
    expect(env.INGESTION_SCHEDULE_ENABLED).toBe(false);
    expect(env.INGESTION_TARGETS[0]).toEqual({
      country: 'chile',
      category: 'breakfast-cereals',
    });

    const custom = validateEnv({
      ...base,
      INGESTION_SCHEDULE_ENABLED: 'true',
      INGESTION_TARGETS: ' chile/en:yogurts , argentina/snacks ',
    });
    expect(custom.INGESTION_TARGETS).toEqual([
      { country: 'chile', category: 'en:yogurts' },
      { country: 'argentina', category: 'snacks' },
    ]);
  });

  it('rechaza objetivos de ingesta mal formados', () => {
    for (const value of ['chile', 'chile/', 'Chile/x1', 'chile/a/b', '']) {
      expect(() => validateEnv({ ...base, INGESTION_TARGETS: value })).toThrow(
        /INGESTION_TARGETS/,
      );
    }
  });
});
