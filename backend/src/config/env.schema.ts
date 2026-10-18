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

  // Ingesta programada desde Open Food Facts (estrategia de actualización, EP2).
  INGESTION_SCHEDULE_ENABLED: booleanString,
  INGESTION_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(10_080)
    .default(360),
  INGESTION_INITIAL_DELAY_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3600)
    .default(60),
  INGESTION_TARGETS: z
    .string()
    .default(
      'chile/breakfast-cereals,chile/dairies,chile/beverages,chile/snacks',
    )
    .transform((value, ctx) => {
      const targets = parseIngestionTargets(value);
      if (!targets) {
        ctx.addIssue({
          code: 'custom',
          message:
            'INGESTION_TARGETS debe ser una lista "pais/categoria" separada por comas',
        });
        return z.NEVER;
      }
      return targets;
    }),
  INGESTION_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(2),
  INGESTION_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  // Días tras los cuales un producto se considera desactualizado en las métricas de calidad.
  DATA_STALE_AFTER_DAYS: z.coerce.number().int().min(1).max(365).default(14),
});

export interface IngestionTarget {
  country: string;
  category: string;
}

const COUNTRY_RE = /^[a-z][a-z-]{1,39}$/;
const CATEGORY_RE = /^[a-z0-9][a-z0-9:-]{1,79}$/;

/** "chile/breakfast-cereals,chile/dairies" → objetivos validados (o null si alguno es inválido). */
export function parseIngestionTargets(raw: string): IngestionTarget[] | null {
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0 || items.length > 20) return null;
  const targets: IngestionTarget[] = [];
  for (const item of items) {
    const [country, category, ...rest] = item.split('/');
    if (
      rest.length ||
      !COUNTRY_RE.test(country) ||
      !CATEGORY_RE.test(category ?? '')
    )
      return null;
    targets.push({ country, category });
  }
  return targets;
}

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
