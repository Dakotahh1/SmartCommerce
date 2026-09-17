import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial de SmartCommerce (EP1).
 * SQL explícito para revisión en PR. Ver docs/03-modelo-datos.md.
 */
export class InitialSchema1758067200000 implements MigrationInterface {
  name = 'InitialSchema1758067200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE user_role AS ENUM ('admin', 'operator', 'user')`,
    );
    await queryRunner.query(
      `CREATE TYPE ingestion_status AS ENUM ('running', 'completed', 'partial', 'failed')`,
    );
    await queryRunner.query(`
      CREATE TYPE interaction_type AS ENUM (
        'view', 'favorite', 'unfavorite', 'compare', 'dismiss',
        'recommendation_click', 'recommendation_accept', 'recommendation_reject'
      )`);

    await queryRunner.query(`
      CREATE TABLE users (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email          varchar(254) NOT NULL,
        password_hash  varchar(255) NOT NULL,
        display_name   varchar(80)  NOT NULL,
        role           user_role    NOT NULL DEFAULT 'user',
        is_active      boolean      NOT NULL DEFAULT true,
        last_login_at  timestamptz,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT users_email_lowercase_chk CHECK (email = lower(email))
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX users_email_uq ON users (email)`,
    );

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token_hash   char(64) NOT NULL,
        family_id    uuid NOT NULL,
        expires_at   timestamptz NOT NULL,
        revoked_at   timestamptz,
        replaced_by  uuid,
        user_agent   varchar(255),
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT refresh_tokens_token_hash_uq UNIQUE (token_hash)
      )`);
    await queryRunner.query(
      `CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE user_preferences (
        user_id                  uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        weights                  jsonb   NOT NULL,
        diets                    text[]  NOT NULL DEFAULT '{}',
        excluded_allergens       text[]  NOT NULL DEFAULT '{}',
        avoid_high_in            boolean NOT NULL DEFAULT false,
        preferred_stores         text[]  NOT NULL DEFAULT '{}',
        personalization_enabled  boolean NOT NULL DEFAULT true,
        updated_at               timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_preferences_weights_obj_chk CHECK (jsonb_typeof(weights) = 'object')
      )`);

    await queryRunner.query(`
      CREATE TABLE data_sources (
        id          serial PRIMARY KEY,
        code        varchar(50)  NOT NULL UNIQUE,
        name        varchar(120) NOT NULL,
        base_url    varchar(255) NOT NULL,
        license     varchar(60)  NOT NULL,
        terms_url   varchar(255) NOT NULL,
        created_at  timestamptz  NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      INSERT INTO data_sources (code, name, base_url, license, terms_url) VALUES
        ('openfoodfacts', 'Open Food Facts', 'https://world.openfoodfacts.org', 'ODbL-1.0',
         'https://world.openfoodfacts.org/terms-of-use'),
        ('openprices', 'Open Prices', 'https://prices.openfoodfacts.org', 'ODbL-1.0',
         'https://prices.openfoodfacts.org/terms')`);

    await queryRunner.query(`
      CREATE TABLE categories (
        id          serial PRIMARY KEY,
        slug        varchar(120) NOT NULL UNIQUE,
        name        varchar(120) NOT NULL,
        created_at  timestamptz  NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE products (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        gtin                varchar(14)  NOT NULL,
        name                varchar(255) NOT NULL,
        brand               varchar(120),
        category_id         int REFERENCES categories (id) ON DELETE SET NULL,
        quantity_text       varchar(80),
        net_quantity        numeric(12, 3),
        unit                varchar(4),
        is_beverage         boolean NOT NULL DEFAULT false,
        image_url           text,
        nutriscore_grade    char(1),
        nova_group          smallint,
        ecoscore_grade      char(1),
        nutriments          jsonb   NOT NULL DEFAULT '{}',
        allergens           text[]  NOT NULL DEFAULT '{}',
        traces              text[]  NOT NULL DEFAULT '{}',
        labels              text[]  NOT NULL DEFAULT '{}',
        diets               jsonb   NOT NULL DEFAULT '{}',
        high_in_seals       text[]  NOT NULL DEFAULT '{}',
        stores              text[]  NOT NULL DEFAULT '{}',
        completeness        numeric(4, 3) NOT NULL DEFAULT 0,
        data_quality_score  numeric(4, 3) NOT NULL DEFAULT 0,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT products_gtin_uq UNIQUE (gtin),
        CONSTRAINT products_gtin_digits_chk CHECK (gtin ~ '^[0-9]{8,14}$'),
        CONSTRAINT products_unit_chk CHECK (unit IS NULL OR unit IN ('g', 'ml')),
        CONSTRAINT products_net_quantity_chk CHECK (net_quantity IS NULL OR net_quantity > 0),
        CONSTRAINT products_nutriscore_chk CHECK (nutriscore_grade IS NULL OR nutriscore_grade IN ('a','b','c','d','e')),
        CONSTRAINT products_ecoscore_chk CHECK (ecoscore_grade IS NULL OR ecoscore_grade IN ('a','b','c','d','e')),
        CONSTRAINT products_nova_chk CHECK (nova_group IS NULL OR nova_group BETWEEN 1 AND 4),
        CONSTRAINT products_scores_chk CHECK (completeness BETWEEN 0 AND 1 AND data_quality_score BETWEEN 0 AND 1)
      )`);
    await queryRunner.query(
      `CREATE INDEX products_category_idx ON products (category_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX products_nutriscore_idx ON products (nutriscore_grade)`,
    );
    await queryRunner.query(
      `CREATE INDEX products_quality_idx ON products (data_quality_score DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX products_allergens_gin ON products USING gin (allergens)`,
    );
    await queryRunner.query(`
      CREATE INDEX products_search_gin ON products
      USING gin (to_tsvector('spanish', coalesce(name, '') || ' ' || coalesce(brand, '')))`);

    await queryRunner.query(`
      CREATE TABLE ingestion_runs (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id        int NOT NULL REFERENCES data_sources (id),
        triggered_by     uuid REFERENCES users (id) ON DELETE SET NULL,
        status           ingestion_status NOT NULL DEFAULT 'running',
        params           jsonb NOT NULL DEFAULT '{}',
        fetched_count    int NOT NULL DEFAULT 0,
        valid_count      int NOT NULL DEFAULT 0,
        inserted_count   int NOT NULL DEFAULT 0,
        updated_count    int NOT NULL DEFAULT 0,
        unchanged_count  int NOT NULL DEFAULT 0,
        duplicate_count  int NOT NULL DEFAULT 0,
        rejected_count   int NOT NULL DEFAULT 0,
        quality_report   jsonb,
        error_message    text,
        request_id       varchar(64),
        started_at       timestamptz NOT NULL DEFAULT now(),
        finished_at      timestamptz,
        CONSTRAINT ingestion_runs_counts_chk CHECK (
          fetched_count >= 0 AND valid_count >= 0 AND inserted_count >= 0 AND updated_count >= 0
          AND unchanged_count >= 0 AND duplicate_count >= 0 AND rejected_count >= 0)
      )`);
    await queryRunner.query(
      `CREATE INDEX ingestion_runs_started_idx ON ingestion_runs (started_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE product_sources (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id               uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        source_id                int  NOT NULL REFERENCES data_sources (id),
        external_id              varchar(64) NOT NULL,
        source_url               text NOT NULL,
        raw_hash                 char(64) NOT NULL,
        source_last_modified_at  timestamptz,
        fetched_at               timestamptz NOT NULL,
        ingestion_run_id         uuid REFERENCES ingestion_runs (id) ON DELETE SET NULL,
        CONSTRAINT product_sources_source_external_uq UNIQUE (source_id, external_id)
      )`);
    await queryRunner.query(
      `CREATE INDEX product_sources_product_idx ON product_sources (product_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE product_prices (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id    uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        source_id     int  NOT NULL REFERENCES data_sources (id),
        external_id   varchar(64),
        amount        numeric(12, 2) NOT NULL CHECK (amount > 0),
        currency      char(3) NOT NULL,
        store_name    varchar(120),
        country_code  char(2),
        observed_at   timestamptz NOT NULL,
        fetched_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_prices_source_external_uq UNIQUE (source_id, external_id)
      )`);
    await queryRunner.query(
      `CREATE INDEX product_prices_product_observed_idx ON product_prices (product_id, observed_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE user_interactions (
        id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        type        interaction_type NOT NULL,
        context     jsonb NOT NULL DEFAULT '{}',
        created_at  timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX user_interactions_user_created_idx ON user_interactions (user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX user_interactions_product_idx ON user_interactions (product_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE favorites (
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, product_id)
      )`);

    await queryRunner.query(`
      CREATE TABLE recommendation_logs (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid REFERENCES users (id) ON DELETE CASCADE,
        strategy        varchar(20) NOT NULL,
        engine_version  varchar(20) NOT NULL,
        degraded        boolean NOT NULL DEFAULT false,
        item_count      int NOT NULL,
        items           jsonb NOT NULL,
        latency_ms      int NOT NULL,
        request_id      varchar(64),
        created_at      timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX recommendation_logs_user_created_idx ON recommendation_logs (user_id, created_at DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'recommendation_logs',
      'favorites',
      'user_interactions',
      'product_prices',
      'product_sources',
      'ingestion_runs',
      'products',
      'categories',
      'data_sources',
      'user_preferences',
      'refresh_tokens',
      'users',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await queryRunner.query(`DROP TYPE IF EXISTS interaction_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS ingestion_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_role`);
  }
}
