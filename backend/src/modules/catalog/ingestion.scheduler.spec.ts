import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { validateEnv, type Env } from '../../config/env.schema.js';
import { AppException } from '../../common/app.exception.js';
import { HttpStatus } from '@nestjs/common';
import {
  INGESTION_LOCK_KEY,
  IngestionScheduler,
} from './ingestion.scheduler.js';
import type { IngestionService } from './ingestion.service.js';

const baseEnv = {
  DB_HOST: 'database',
  DB_NAME: 'smartcommerce',
  DB_USER: 'smartcommerce_app',
  DB_PASSWORD: 'una-clave-larga',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  PYTHON_SERVICE_URL: 'http://python-service:8000',
  INTERNAL_API_TOKEN: 'y'.repeat(40),
  INGESTION_TARGETS: 'chile/breakfast-cereals,chile/dairies',
  INGESTION_MAX_PAGES: '3',
  INGESTION_PAGE_SIZE: '2',
};

function run(fetched: number) {
  return {
    counts: {
      fetched,
      valid: fetched,
      inserted: fetched,
      updated: 0,
      unchanged: 0,
      duplicates: 0,
      rejected: 0,
    },
  };
}

function setup(
  start: () => Promise<unknown>,
  { locked = true, env = {} as Record<string, string> } = {},
) {
  const values = validateEnv({ ...baseEnv, ...env });
  const config = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  const query = vi.fn(async (sql: string) =>
    sql.includes('pg_try_advisory_lock') ? [{ locked }] : [],
  );
  const runner = {
    connect: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    query,
  };
  const dataSource = {
    createQueryRunner: () => runner,
  } as unknown as DataSource;
  const ingestion = { start: vi.fn(start) } as unknown as IngestionService;
  return {
    scheduler: new IngestionScheduler(config, ingestion, dataSource),
    ingestion: ingestion as unknown as { start: ReturnType<typeof vi.fn> },
    runner,
  };
}

describe('IngestionScheduler', () => {
  it('recorre cada objetivo y pagina hasta que una página viene incompleta', async () => {
    // breakfast-cereals: 2 (llena) → 1 (incompleta, se detiene); dairies: 2 → 2 → 2 (máx. 3)
    const pages = [2, 1, 2, 2, 2];
    const { scheduler, ingestion, runner } = setup(async () =>
      run(pages.shift() ?? 0),
    );

    const summary = await scheduler.runBatch('req-1');

    expect(summary.status).toBe('completed');
    expect(
      summary.targets.map((t) => [t.category, t.pages, t.fetched]),
    ).toEqual([
      ['breakfast-cereals', 2, 3],
      ['dairies', 3, 6],
    ]);
    const calls = ingestion.start.mock.calls;
    expect(calls).toHaveLength(5);
    // Ingesta de sistema: sin usuario y marcada como programada.
    expect(calls[0][1]).toBeNull();
    expect(calls[0][3]).toBe('scheduled');
    expect(calls[0][0]).toMatchObject({
      country: 'chile',
      category: 'breakfast-cereals',
      page: 1,
      pageSize: 2,
    });
    expect(runner.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [
      INGESTION_LOCK_KEY,
    ]);
    expect(runner.release).toHaveBeenCalled();
    expect(scheduler.status().lastBatch?.requestId).toBe('req-1');
  });

  it('si la fuente falla en un objetivo, lo registra y continúa con el siguiente', async () => {
    let call = 0;
    const { scheduler } = setup(async () => {
      call += 1;
      if (call === 1) {
        throw new AppException(
          HttpStatus.BAD_GATEWAY,
          'SOURCE_UNAVAILABLE',
          'Open Food Facts no está disponible en este momento',
        );
      }
      return run(1);
    });

    const summary = await scheduler.runBatch();

    expect(summary.status).toBe('partial');
    expect(summary.targets[0].error).toMatch(/no está disponible/);
    expect(summary.targets[1]).toMatchObject({ pages: 1, error: null });
  });

  it('marca el lote como fallido si todos los objetivos fallan', async () => {
    const { scheduler } = setup(async () => {
      throw new Error('caído');
    });
    expect((await scheduler.runBatch()).status).toBe('failed');
  });

  it('omite el lote si otra réplica tiene el advisory lock', async () => {
    const { scheduler, ingestion, runner } = setup(async () => run(1), {
      locked: false,
    });

    const summary = await scheduler.runBatch();

    expect(summary).toMatchObject({ status: 'skipped' });
    expect(ingestion.start).not.toHaveBeenCalled();
    expect(runner.query).not.toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock($1)',
      expect.anything(),
    );
    expect(runner.release).toHaveBeenCalled();
  });

  it('no inicia un segundo lote mientras el primero sigue en curso', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { scheduler } = setup(async () => {
      await gate;
      return run(0);
    });

    const first = scheduler.trigger();
    const second = scheduler.trigger();
    expect(first.accepted).toBe(true);
    expect(second).toEqual({ accepted: false, requestId: null });
    expect(scheduler.status().running).toBe(true);

    release();
    await vi.waitFor(() => expect(scheduler.status().running).toBe(false));
  });

  it('solo programa ejecuciones cuando está habilitado', () => {
    vi.useFakeTimers();
    try {
      const disabled = setup(async () => run(0));
      disabled.scheduler.onApplicationBootstrap();
      expect(disabled.scheduler.status().nextRunAt).toBeNull();

      const enabled = setup(async () => run(0), {
        env: {
          INGESTION_SCHEDULE_ENABLED: 'true',
          INGESTION_INITIAL_DELAY_SECONDS: '10',
        },
      });
      enabled.scheduler.onApplicationBootstrap();
      expect(enabled.scheduler.status().nextRunAt).toBeInstanceOf(Date);
      vi.advanceTimersByTime(10_000);
      expect(enabled.ingestion.start).toHaveBeenCalledTimes(0); // espera el lock (async)
      enabled.scheduler.onModuleDestroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
