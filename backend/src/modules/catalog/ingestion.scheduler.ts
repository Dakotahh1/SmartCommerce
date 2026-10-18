import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { Env, IngestionTarget } from '../../config/env.schema.js';
import { StartIngestionDto } from './ingestion.dto.js';
import { IngestionService } from './ingestion.service.js';

/** Clave del advisory lock de PostgreSQL: evita lotes simultáneos entre réplicas. */
export const INGESTION_LOCK_KEY = 72_031_001;

export interface TargetOutcome {
  country: string;
  category: string;
  pages: number;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  rejected: number;
  error: string | null;
}

export interface BatchSummary {
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  reason?: string;
  requestId: string;
  startedAt: string;
  finishedAt: string;
  targets: TargetOutcome[];
}

/**
 * Programador de la ingesta automatizada (estrategia de actualización de la EP2).
 *
 * Recorre los objetivos `pais/categoria` configurados, página por página, reutilizando
 * el mismo flujo que la ingesta manual. Garantías:
 *  - un solo lote a la vez (bandera local + `pg_try_advisory_lock` entre réplicas);
 *  - si la fuente falla en un objetivo, se registra y se continúa con el siguiente;
 *  - se detiene la paginación cuando una página trae menos productos que el tamaño pedido;
 *  - el lote es asíncrono: el endpoint de administración no espera a que termine.
 */
@Injectable()
export class IngestionScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(IngestionScheduler.name);
  private initialTimer?: NodeJS.Timeout;
  private intervalTimer?: NodeJS.Timeout;
  private running = false;
  private lastBatch: BatchSummary | null = null;
  private nextRunAt: Date | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly ingestion: IngestionService,
    private readonly dataSource: DataSource,
  ) {}

  get enabled(): boolean {
    return this.config.get('INGESTION_SCHEDULE_ENABLED', { infer: true });
  }

  private get intervalMs(): number {
    return (
      this.config.get('INGESTION_INTERVAL_MINUTES', { infer: true }) * 60_000
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Ingesta programada desactivada');
      return;
    }
    const delayMs =
      this.config.get('INGESTION_INITIAL_DELAY_SECONDS', { infer: true }) *
      1000;
    this.nextRunAt = new Date(Date.now() + delayMs);
    this.initialTimer = setTimeout(() => {
      void this.tick();
      this.intervalTimer = setInterval(() => void this.tick(), this.intervalMs);
      this.intervalTimer.unref();
    }, delayMs);
    this.initialTimer.unref();
    this.logger.log(
      {
        intervalMinutes: this.intervalMs / 60_000,
        targets: this.targets.length,
      },
      'Ingesta programada activada',
    );
  }

  onModuleDestroy(): void {
    clearTimeout(this.initialTimer);
    clearInterval(this.intervalTimer);
  }

  private get targets(): IngestionTarget[] {
    return this.config.get('INGESTION_TARGETS', { infer: true });
  }

  private async tick(): Promise<void> {
    this.nextRunAt = new Date(Date.now() + this.intervalMs);
    await this.runBatch();
  }

  /** Estado visible en Administración: configuración, último lote y próxima ejecución. */
  status() {
    return {
      enabled: this.enabled,
      running: this.running,
      intervalMinutes: this.intervalMs / 60_000,
      maxPages: this.config.get('INGESTION_MAX_PAGES', { infer: true }),
      pageSize: this.config.get('INGESTION_PAGE_SIZE', { infer: true }),
      targets: this.targets,
      nextRunAt: this.enabled ? this.nextRunAt : null,
      lastBatch: this.lastBatch,
    };
  }

  /** Dispara un lote sin esperar su resultado (respuesta 202 en el controlador). */
  trigger(): { accepted: boolean; requestId: string | null } {
    if (this.running) return { accepted: false, requestId: null };
    const requestId = `ingest-${randomUUID()}`;
    void this.runBatch(requestId);
    return { accepted: true, requestId };
  }

  async runBatch(requestId = `ingest-${randomUUID()}`): Promise<BatchSummary> {
    const startedAt = new Date().toISOString();
    const skip = (reason: string): BatchSummary => ({
      status: 'skipped',
      reason,
      requestId,
      startedAt,
      finishedAt: new Date().toISOString(),
      targets: [],
    });
    if (this.running) return skip('Ya hay un lote en ejecución');
    this.running = true;

    const runner = this.dataSource.createQueryRunner();
    let locked = false;
    try {
      await runner.connect();
      const [row] = (await runner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [INGESTION_LOCK_KEY],
      )) as { locked: boolean }[];
      locked = Boolean(row?.locked);
      if (!locked) return skip('Otra instancia ejecuta un lote');

      this.logger.log(
        { requestId, targets: this.targets.length },
        'Lote de ingesta iniciado',
      );
      const outcomes: TargetOutcome[] = [];
      for (const target of this.targets) {
        outcomes.push(await this.ingestTarget(target, requestId));
      }
      const failed = outcomes.filter((o) => o.error !== null).length;
      const summary: BatchSummary = {
        status:
          failed === 0
            ? 'completed'
            : failed === outcomes.length
              ? 'failed'
              : 'partial',
        requestId,
        startedAt,
        finishedAt: new Date().toISOString(),
        targets: outcomes,
      };
      this.lastBatch = summary;
      const log = failed ? 'warn' : 'log';
      this.logger[log](
        { requestId, status: summary.status, failedTargets: failed },
        'Lote de ingesta finalizado',
      );
      return summary;
    } catch (error) {
      this.logger.error(
        { requestId, error: (error as Error).message },
        'Lote de ingesta abortado',
      );
      this.lastBatch = {
        ...skip('Error inesperado'),
        status: 'failed',
      };
      return this.lastBatch;
    } finally {
      if (locked) {
        await runner
          .query('SELECT pg_advisory_unlock($1)', [INGESTION_LOCK_KEY])
          .catch(() => undefined);
      }
      await runner.release().catch(() => undefined);
      this.running = false;
    }
  }

  private async ingestTarget(
    target: IngestionTarget,
    requestId: string,
  ): Promise<TargetOutcome> {
    const pageSize = this.config.get('INGESTION_PAGE_SIZE', { infer: true });
    const maxPages = this.config.get('INGESTION_MAX_PAGES', { infer: true });
    const outcome: TargetOutcome = {
      ...target,
      pages: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      rejected: 0,
      error: null,
    };
    for (let page = 1; page <= maxPages; page += 1) {
      const dto = Object.assign(new StartIngestionDto(), {
        country: target.country,
        category: target.category,
        page,
        pageSize,
      });
      try {
        const run = await this.ingestion.start(
          dto,
          null,
          `${requestId}-${target.category}-p${page}`.slice(0, 64),
          'scheduled',
        );
        outcome.pages += 1;
        outcome.fetched += run.counts.fetched;
        outcome.inserted += run.counts.inserted;
        outcome.updated += run.counts.updated;
        outcome.unchanged += run.counts.unchanged;
        outcome.rejected += run.counts.rejected;
        if (run.counts.fetched < pageSize) break;
      } catch (error) {
        // La fuente o Python no están disponibles: se registra (ingestion_runs ya quedó
        // con estado failed) y se pasa al siguiente objetivo sin bloquear el lote.
        outcome.error = (error as Error).message;
        break;
      }
    }
    return outcome;
  }
}
