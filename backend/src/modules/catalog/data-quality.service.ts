import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Env } from '../../config/env.schema.js';
import { SmartMatchClient } from '../smartmatch/smartmatch.client.js';

const ratio = (part: number, total: number) =>
  total > 0 ? Number((part / total).toFixed(3)) : null;
const num = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);
const round = (value: number | null, digits = 1) =>
  value === null ? null : Number(value.toFixed(digits));

/** Umbrales de alerta de calidad (documentados en docs/10). */
export const QUALITY_THRESHOLDS = {
  minValidRatio: 0.8,
  maxDuplicateRatio: 0.1,
  maxStaleRatio: 0.2,
  maxErrorRate: 0.2,
} as const;

interface CatalogRow {
  total: number;
  avg_quality: number | null;
  brand: number;
  category: number;
  quantity: number;
  nutriscore: number;
  nova: number;
  ecoscore: number;
  nutriments: number;
  image: number;
  stores: number;
  indexed: number;
}

interface IngestionRow {
  runs: number;
  failed: number;
  scheduled: number;
  fetched: number;
  valid: number;
  rejected: number;
  duplicates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  avg_ms: number | null;
  p95_ms: number | null;
  last_success: Date | null;
}

/**
 * Evaluación de la calidad de la información recuperada desde la Web (EP2):
 * validez, duplicados, cobertura de campos y de la fuente, actualidad, tasa de errores
 * y tiempos de recuperación, más alertas cuando se cruzan los umbrales.
 */
@Injectable()
export class DataQualityService {
  private readonly logger = new Logger(DataQualityService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly smartmatch: SmartMatchClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async report(days: number, requestId?: string) {
    const staleDays = this.config.get('DATA_STALE_AFTER_DAYS', { infer: true });
    const [
      [catalog],
      [prices],
      [freshness],
      [ingestion],
      rejections,
      failures,
      sourceCoverage,
      upstream,
    ] = await Promise.all([
      this.dataSource.query<CatalogRow[]>(`
        SELECT count(*)::int AS total,
               avg(data_quality_score)::float8 AS avg_quality,
               count(*) FILTER (WHERE brand IS NOT NULL)::int AS brand,
               count(*) FILTER (WHERE category_id IS NOT NULL)::int AS category,
               count(*) FILTER (WHERE net_quantity IS NOT NULL)::int AS quantity,
               count(*) FILTER (WHERE nutriscore_grade IS NOT NULL)::int AS nutriscore,
               count(*) FILTER (WHERE nova_group IS NOT NULL)::int AS nova,
               count(*) FILTER (WHERE ecoscore_grade IS NOT NULL)::int AS ecoscore,
               count(*) FILTER (WHERE nutriments->>'energyKcal' IS NOT NULL
                                  AND nutriments->>'sugars' IS NOT NULL
                                  AND nutriments->>'saturatedFat' IS NOT NULL
                                  AND nutriments->>'sodiumMg' IS NOT NULL)::int AS nutriments,
               count(*) FILTER (WHERE image_url IS NOT NULL)::int AS image,
               count(*) FILTER (WHERE cardinality(stores) > 0)::int AS stores,
               count(*) FILTER (WHERE search_primary <> '')::int AS indexed
          FROM products`),
      this.dataSource.query<{ with_price: number }[]>(
        `SELECT count(DISTINCT product_id)::int AS with_price FROM product_prices`,
      ),
      this.dataSource.query<
        {
          tracked: number;
          stale: number;
          oldest: Date | null;
          newest: Date | null;
          median_age_hours: number | null;
          median_source_age_days: number | null;
        }[]
      >(
        `
        SELECT count(*)::int AS tracked,
               count(*) FILTER (WHERE fetched_at < now() - make_interval(days => $1))::int AS stale,
               min(fetched_at) AS oldest,
               max(fetched_at) AS newest,
               (percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY extract(epoch FROM now() - fetched_at)) / 3600)::float8 AS median_age_hours,
               (percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY extract(epoch FROM now() - source_last_modified_at)) / 86400)::float8
                  AS median_source_age_days
          FROM product_sources`,
        [staleDays],
      ),
      this.dataSource.query<IngestionRow[]>(
        `
        SELECT count(*)::int AS runs,
               count(*) FILTER (WHERE status = 'failed')::int AS failed,
               count(*) FILTER (WHERE params->>'trigger' = 'scheduled')::int AS scheduled,
               coalesce(sum(fetched_count), 0)::int AS fetched,
               coalesce(sum(valid_count), 0)::int AS valid,
               coalesce(sum(rejected_count), 0)::int AS rejected,
               coalesce(sum(duplicate_count), 0)::int AS duplicates,
               coalesce(sum(inserted_count), 0)::int AS inserted,
               coalesce(sum(updated_count), 0)::int AS updated,
               coalesce(sum(unchanged_count), 0)::int AS unchanged,
               avg(extract(epoch FROM finished_at - started_at) * 1000)::float8 AS avg_ms,
               (percentile_cont(0.95) WITHIN GROUP (
                  ORDER BY extract(epoch FROM finished_at - started_at) * 1000))::float8 AS p95_ms,
               max(started_at) FILTER (WHERE status = 'completed') AS last_success
          FROM ingestion_runs
         WHERE started_at >= now() - make_interval(days => $1)`,
        [days],
      ),
      this.dataSource.query<{ reason: string; count: number }[]>(
        `
        SELECT r->>'reason' AS reason, count(*)::int AS count
          FROM ingestion_runs ir,
               jsonb_array_elements(coalesce(ir.quality_report->'rejections', '[]'::jsonb)) r
         WHERE ir.started_at >= now() - make_interval(days => $1)
         GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`,
        [days],
      ),
      this.dataSource.query<
        {
          id: string;
          error: string | null;
          started_at: Date;
          trigger: string;
        }[]
      >(
        `
        SELECT id, error_message AS error, started_at, coalesce(params->>'trigger', 'manual') AS trigger
          FROM ingestion_runs
         WHERE status = 'failed' AND started_at >= now() - make_interval(days => $1)
         ORDER BY started_at DESC LIMIT 5`,
        [days],
      ),
      this.dataSource.query<
        {
          category: string;
          total_available: number | null;
          stored: number;
          last_run: Date;
        }[]
      >(`
        WITH latest AS (
          SELECT DISTINCT ON (params->>'category')
                 params->>'category' AS category,
                 (quality_report->>'totalAvailable')::int AS total_available,
                 started_at AS last_run
            FROM ingestion_runs
           WHERE status = 'completed' AND params->>'category' IS NOT NULL
           ORDER BY params->>'category', started_at DESC
        ), stored AS (
          SELECT ir.params->>'category' AS category, count(*)::int AS stored
            FROM product_sources ps
            JOIN ingestion_runs ir ON ir.id = ps.ingestion_run_id
           GROUP BY 1
        )
        SELECT latest.category, latest.total_available, coalesce(stored.stored, 0)::int AS stored,
               latest.last_run
          FROM latest LEFT JOIN stored USING (category)
         ORDER BY latest.category`),
      this.smartmatch.metrics(requestId).then(
        (m) => m.upstream['openfoodfacts'] ?? null,
        (error: unknown) => {
          this.logger.warn(
            { requestId, error: (error as Error).message },
            'Métricas de la fuente no disponibles',
          );
          return null;
        },
      ),
    ]);

    const total = catalog.total;
    const coverage = Object.fromEntries(
      (
        [
          'brand',
          'category',
          'quantity',
          'nutriscore',
          'nova',
          'ecoscore',
          'nutriments',
          'image',
          'stores',
        ] as const
      ).map((key) => [key, ratio(catalog[key], total)]),
    ) as Record<string, number | null>;
    coverage.price = ratio(prices.with_price, total);

    const validity = {
      fetched: ingestion.fetched,
      valid: ingestion.valid,
      rejected: ingestion.rejected,
      duplicates: ingestion.duplicates,
      validRatio: ratio(ingestion.valid, ingestion.fetched),
      duplicateRatio: ratio(ingestion.duplicates, ingestion.fetched),
      topRejectionReasons: rejections,
    };
    const fresh = {
      staleAfterDays: staleDays,
      tracked: freshness.tracked,
      stale: freshness.stale,
      staleRatio: ratio(freshness.stale, freshness.tracked),
      oldestFetchAt: freshness.oldest,
      newestFetchAt: freshness.newest,
      medianAgeHours: round(num(freshness.median_age_hours)),
      medianSourceAgeDays: round(num(freshness.median_source_age_days)),
    };
    const reliability = {
      runs: ingestion.runs,
      failed: ingestion.failed,
      scheduled: ingestion.scheduled,
      errorRate: ratio(ingestion.failed, ingestion.runs),
      avgDurationMs: round(num(ingestion.avg_ms), 0),
      p95DurationMs: round(num(ingestion.p95_ms), 0),
      lastSuccessAt: ingestion.last_success,
      recentFailures: failures.map((f) => ({
        id: f.id,
        error: f.error,
        trigger: f.trigger,
        startedAt: f.started_at,
      })),
      changes: {
        inserted: ingestion.inserted,
        updated: ingestion.updated,
        unchanged: ingestion.unchanged,
      },
    };

    return {
      generatedAt: new Date().toISOString(),
      windowDays: days,
      thresholds: QUALITY_THRESHOLDS,
      catalog: {
        products: total,
        indexedRatio: ratio(catalog.indexed, total),
        avgDataQualityScore: round(num(catalog.avg_quality), 3),
        fieldCoverage: coverage,
      },
      validity,
      freshness: fresh,
      sourceCoverage: sourceCoverage.map((row) => ({
        category: row.category,
        totalAvailable: row.total_available,
        stored: row.stored,
        coverageRatio:
          row.total_available === null
            ? null
            : ratio(
                Math.min(row.stored, row.total_available),
                row.total_available,
              ),
        lastRunAt: row.last_run,
      })),
      reliability,
      source: upstream,
      alerts: this.alerts(validity, fresh, reliability),
    };
  }

  private alerts(
    validity: { validRatio: number | null; duplicateRatio: number | null },
    freshness: { staleRatio: number | null },
    reliability: { errorRate: number | null; lastSuccessAt: Date | null },
  ) {
    const alerts: { code: string; message: string }[] = [];
    const t = QUALITY_THRESHOLDS;
    if (validity.validRatio !== null && validity.validRatio < t.minValidRatio)
      alerts.push({
        code: 'LOW_VALID_RATIO',
        message: `Solo ${Math.round(validity.validRatio * 100)} % de los registros recuperados es válido`,
      });
    if (
      validity.duplicateRatio !== null &&
      validity.duplicateRatio > t.maxDuplicateRatio
    )
      alerts.push({
        code: 'HIGH_DUPLICATE_RATIO',
        message: `${Math.round(validity.duplicateRatio * 100)} % de duplicados en la fuente`,
      });
    if (freshness.staleRatio !== null && freshness.staleRatio > t.maxStaleRatio)
      alerts.push({
        code: 'STALE_DATA',
        message: `${Math.round(freshness.staleRatio * 100)} % del catálogo no se actualiza hace más del umbral`,
      });
    if (
      reliability.errorRate !== null &&
      reliability.errorRate > t.maxErrorRate
    )
      alerts.push({
        code: 'HIGH_ERROR_RATE',
        message: `${Math.round(reliability.errorRate * 100)} % de las ingestas fallaron`,
      });
    if (reliability.lastSuccessAt === null)
      alerts.push({
        code: 'NO_SUCCESSFUL_INGESTION',
        message: 'No hay ingestas exitosas en la ventana analizada',
      });
    return alerts;
  }
}
