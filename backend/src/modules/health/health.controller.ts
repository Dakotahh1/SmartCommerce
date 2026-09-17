import {
  Controller,
  Get,
  HttpStatus,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public, RequestId, Roles } from '../../common/auth.decorators.js';
import { Role } from '../../common/enums.js';
import { MetricsRegistry } from '../../common/metrics.js';
import type { Env } from '../../config/env.schema.js';
import { SmartMatchClient } from '../smartmatch/smartmatch.client.js';

type CheckStatus = 'up' | 'down';

interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
}

async function timed(
  fn: () => Promise<Omit<CheckResult, 'latencyMs'>>,
): Promise<CheckResult> {
  const started = performance.now();
  try {
    const result = await fn();
    return { ...result, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.name : 'Error',
    };
  }
}

@ApiTags('salud')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly smartmatch: SmartMatchClient,
    private readonly config: ConfigService<Env, true>,
    private readonly metrics: MetricsRegistry,
  ) {}

  /** Liveness: el proceso responde (usado por el healthcheck del contenedor). */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Estado general: `ok` (todo arriba), `degraded` (API y BD arriba, pero SmartMatch o la fuente
   * web caídos: la app funciona en modo degradado) o `down` (sin base de datos → HTTP 503).
   */
  @Public()
  @Get()
  @ApiOkResponse({ description: 'ok | degraded' })
  @ApiServiceUnavailableResponse({
    description: 'down (base de datos no disponible)',
  })
  async check(
    @Res({ passthrough: true }) res: Response,
    @RequestId() requestId: string,
  ) {
    const [database, readiness] = await Promise.all([
      timed(async () => {
        await this.dataSource.query('SELECT 1');
        return { status: 'up' as const };
      }),
      this.smartmatch
        .readiness(requestId)
        .then((r) => ({ ok: true as const, r }))
        .catch((error: unknown) => ({ ok: false as const, error })),
    ]);

    const smartmatch: CheckResult = readiness.ok
      ? { status: 'up' }
      : {
          status: 'down',
          detail:
            readiness.error instanceof Error ? readiness.error.name : 'Error',
        };
    const openfoodfacts: CheckResult = readiness.ok
      ? { status: readiness.r.checks.openfoodfacts === 'down' ? 'down' : 'up' }
      : { status: 'down', detail: 'Sin información: SmartMatch no disponible' };

    const status =
      database.status === 'down'
        ? 'down'
        : smartmatch.status === 'down' || openfoodfacts.status === 'down'
          ? 'degraded'
          : 'ok';
    if (status === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status,
      version: this.config.get('APP_VERSION', { infer: true }),
      environment: this.config.get('NODE_ENV', { infer: true }),
      uptimeSeconds: Math.round((Date.now() - this.metrics.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        api: { status: 'up' },
        database,
        smartmatch: {
          ...smartmatch,
          circuit: this.smartmatch.breaker.currentState,
        },
        openfoodfacts,
      },
    };
  }

  /** Métricas de solicitudes por ruta (solo administradores). */
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.OPERATOR)
  @Get('metrics')
  metricsSnapshot() {
    return this.metrics.snapshot();
  }
}
