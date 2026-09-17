import { DataSource, type DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env.schema.js';
import {
  Favorite,
  RecommendationLog,
  UserInteraction,
} from './entities/activity.entities.js';
import {
  Category,
  DataSourceEntity,
  IngestionRun,
  Product,
  ProductPrice,
  ProductSource,
} from './entities/catalog.entities.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { UserPreferences } from './entities/user-preferences.entity.js';
import { User } from './entities/user.entity.js';
import { InitialSchema1758067200000 } from './migrations/1758067200000-InitialSchema.js';

export const ENTITIES = [
  User,
  RefreshToken,
  UserPreferences,
  DataSourceEntity,
  Category,
  Product,
  ProductSource,
  ProductPrice,
  IngestionRun,
  UserInteraction,
  Favorite,
  RecommendationLog,
];

export const MIGRATIONS = [InitialSchema1758067200000];

type DbEnv = Pick<
  Env,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_NAME'
  | 'DB_USER'
  | 'DB_PASSWORD'
  | 'DB_SSL'
  | 'DB_POOL_MAX'
>;

/** Opciones compartidas por la API, la CLI de migraciones y las pruebas de integración. */
export function buildDataSourceOptions(
  env: DbEnv,
  credentials?: { user: string; password: string },
): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: credentials?.user ?? env.DB_USER,
    password: credentials?.password ?? env.DB_PASSWORD,
    ssl: env.DB_SSL ? { rejectUnauthorized: true } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    logging: ['error'],
    extra: {
      max: env.DB_POOL_MAX,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15_000,
    },
  };
}

export function createDataSource(
  env: DbEnv,
  credentials?: { user: string; password: string },
) {
  return new DataSource(buildDataSourceOptions(env, credentials));
}
