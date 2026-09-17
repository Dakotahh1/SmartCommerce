/**
 * CLI de migraciones (se ejecuta en el contenedor one-shot `migrate` con el rol propietario).
 *
 *   node dist/database/migrate.js run | revert | show
 *
 * Usa DB_MIGRATION_USER / DB_MIGRATION_PASSWORD si existen; si no, DB_USER / DB_PASSWORD.
 */
import 'reflect-metadata';
import { z } from 'zod';
import { createDataSource } from './data-source.js';

const migrationEnvSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_MIGRATION_USER: z.string().optional(),
  DB_MIGRATION_PASSWORD: z.string().optional(),
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().default(2),
});

function log(
  level: 'info' | 'error',
  message: string,
  extra: Record<string, unknown> = {},
) {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), level, service: 'migrate', message, ...extra })}\n`,
  );
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'run';
  if (!['run', 'revert', 'show'].includes(command)) {
    throw new Error(
      `Comando desconocido "${command}". Use run | revert | show`,
    );
  }
  const env = migrationEnvSchema.parse(process.env);
  const dataSource = createDataSource(env, {
    user: env.DB_MIGRATION_USER ?? env.DB_USER,
    password: env.DB_MIGRATION_PASSWORD ?? env.DB_PASSWORD,
  });

  await dataSource.initialize();
  try {
    if (command === 'run') {
      const applied = await dataSource.runMigrations({ transaction: 'each' });
      log('info', 'migraciones aplicadas', {
        applied: applied.map((m) => m.name),
      });
    } else if (command === 'revert') {
      await dataSource.undoLastMigration({ transaction: 'each' });
      log('info', 'última migración revertida');
    } else {
      const pending = await dataSource.showMigrations();
      log('info', 'estado de migraciones', { pending });
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  log('error', 'falló la migración', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
