import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/**
 * Variables de entorno del backend. Se validan al arrancar: si falta un secreto
 * o un valor es inválido, la aplicación no inicia (fail fast).
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  APP_VERSION: z.string().default('0.1.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:8100,http://localhost:4200,http://localhost:8080',
    ),
  TRUST_PROXY: booleanString,
  SWAGGER_ENABLED: booleanString,
  THROTTLE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z
    .string()
    .min(8, 'DB_PASSWORD debe tener al menos 8 caracteres'),
  DB_SSL: booleanString,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),

  PYTHON_SERVICE_URL: z.url(),
  INTERNAL_API_TOKEN: z
    .string()
    .min(32, 'INTERNAL_API_TOKEN debe tener al menos 32 caracteres'),
  SMARTMATCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(5000),
  SMARTMATCH_INGESTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(30_000),
  SMARTMATCH_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  SMARTMATCH_BREAKER_THRESHOLD: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5),
  SMARTMATCH_BREAKER_OPEN_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(600_000)
    .default(30_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración inválida del backend → ${issues}`);
  }
  return result.data;
}
