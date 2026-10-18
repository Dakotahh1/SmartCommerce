import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * EP2 · Índice de búsqueda del catálogo.
 *
 * - `search_primary` / `search_secondary`: tokens normalizados por el servicio Python
 *   (nombre y marcas / nombre genérico, categorías en español y sellos).
 * - `search_vector`: columna generada con pesos A (primario) y B (secundario) y
 *   configuración `simple` (sin stemming de PostgreSQL: la normalización ya se hizo en Python
 *   y se repite igual en la consulta). Índice GIN para la búsqueda y `ts_rank_cd` para el ranking.
 * - Relleno inicial aproximado para productos existentes; la siguiente ingesta los completa.
 */
export class SearchIndex1760500000000 implements MigrationInterface {
  name = 'SearchIndex1760500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE products
        ADD COLUMN search_primary   varchar(500)  NOT NULL DEFAULT '',
        ADD COLUMN search_secondary varchar(1000) NOT NULL DEFAULT ''`);
    await queryRunner.query(`
      UPDATE products
         SET search_primary = left(
               trim(regexp_replace(
                 translate(lower(name || ' ' || coalesce(brand, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
                 '[^a-z0-9]+', ' ', 'g')),
               500)`);
    await queryRunner.query(`
      ALTER TABLE products
        ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('simple', search_primary), 'A') ||
          setweight(to_tsvector('simple', search_secondary), 'B')
        ) STORED`);
    await queryRunner.query(`DROP INDEX IF EXISTS products_search_gin`);
    await queryRunner.query(
      `CREATE INDEX products_search_vector_gin ON products USING gin (search_vector)`,
    );
    // Consultas de actualidad (métricas de calidad) por fecha de recuperación.
    await queryRunner.query(
      `CREATE INDEX product_sources_fetched_idx ON product_sources (fetched_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS product_sources_fetched_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS products_search_vector_gin`);
    await queryRunner.query(`
      ALTER TABLE products
        DROP COLUMN IF EXISTS search_vector,
        DROP COLUMN IF EXISTS search_secondary,
        DROP COLUMN IF EXISTS search_primary`);
    await queryRunner.query(`
      CREATE INDEX products_search_gin ON products
      USING gin (to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(brand, '')))`);
  }
}
