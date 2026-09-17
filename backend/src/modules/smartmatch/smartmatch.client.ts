import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ZodType } from 'zod';
import type { Env } from '../../config/env.schema.js';
import { CircuitBreaker } from './circuit-breaker.js';
import {
  compareResponseSchema,
  ingestionResponseSchema,
  rankResponseSchema,
  readinessSchema,
  type CompareRequest,
  type CompareResponse,
  type IngestionRequest,
  type IngestionResponse,
  type RankRequest,
  type RankResponse,
  type Readiness,
} from './smartmatch.contracts.js';

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** El servicio no respondió, respondió 5xx o el circuito está abierto. */
export class SmartMatchUnavailableError extends Error {
  constructor(
    readonly reason: 'timeout' | 'network' | 'circuit_open' | 'upstream_status',
    readonly status?: number,
    readonly upstreamCode?: string,
  ) {
    super(`SmartMatch no disponible (${reason}${status ? ` ${status}` : ''})`);
  }
}

/** El servicio respondió con un contrato inválido. */
export class SmartMatchInvalidResponseError extends Error {
  constructor(readonly issues: string) {
    super('SmartMatch respondió con un formato inválido');
  }
}

/** El servicio rechazó la solicitud (4xx): error de contrato del lado de NestJS. */
export class SmartMatchRequestError extends Error {
  constructor(
    readonly status: number,
    readonly upstreamCode?: string,
  ) {
    super(`SmartMatch rechazó la solicitud (${status} ${upstreamCode ?? ''})`);
  }
}

interface CallOptions {
  timeoutMs: number;
  retries: number;
  requestId?: string;
}

@Injectable()
export class SmartMatchClient {
  private readonly logger = new Logger(SmartMatchClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly ingestionTimeoutMs: number;
  private readonly maxRetries: number;
  readonly breaker: CircuitBreaker;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config
      .get('PYTHON_SERVICE_URL', { infer: true })
      .replace(/\/$/, '');
    this.token = config.get('INTERNAL_API_TOKEN', { infer: true });
    this.timeoutMs = config.get('SMARTMATCH_TIMEOUT_MS', { infer: true });
    this.ingestionTimeoutMs = config.get('SMARTMATCH_INGESTION_TIMEOUT_MS', {
      infer: true,
    });
    this.maxRetries = config.get('SMARTMATCH_MAX_RETRIES', { infer: true });
    this.breaker = new CircuitBreaker(
      config.get('SMARTMATCH_BREAKER_THRESHOLD', { infer: true }),
      config.get('SMARTMATCH_BREAKER_OPEN_MS', { infer: true }),
    );
  }

  rank(payload: RankRequest, requestId?: string): Promise<RankResponse> {
    return this.call(
      'POST',
      '/v1/recommendations/rank',
      rankResponseSchema,
      payload,
      {
        timeoutMs: this.timeoutMs,
        retries: this.maxRetries,
        requestId,
      },
    );
  }

  compare(
    payload: CompareRequest,
    requestId?: string,
  ): Promise<CompareResponse> {
    return this.call(
      'POST',
      '/v1/comparisons',
      compareResponseSchema,
      payload,
      {
        timeoutMs: this.timeoutMs,
        retries: this.maxRetries,
        requestId,
      },
    );
  }

  /** Sin reintentos: el servicio Python ya reintenta contra la fuente web y respeta su rate limit. */
  ingestOpenFoodFacts(
    payload: IngestionRequest,
    requestId?: string,
  ): Promise<IngestionResponse> {
    return this.call(
      'POST',
      '/v1/ingestion/openfoodfacts/search',
      ingestionResponseSchema,
      payload,
      { timeoutMs: this.ingestionTimeoutMs, retries: 0, requestId },
    );
  }

  /** Estado del servicio y de la fuente externa (no afecta al circuit breaker). */
  async readiness(requestId?: string): Promise<Readiness> {
    const response = await fetch(`${this.baseUrl}/health/ready?deep=true`, {
      headers: this.headers(requestId),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok)
      throw new SmartMatchUnavailableError('upstream_status', response.status);
    const parsed = readinessSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new SmartMatchInvalidResponseError(parsed.error.message);
    return parsed.data;
  }

  private headers(requestId?: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Internal-Token': this.token,
      ...(requestId ? { 'X-Request-Id': requestId } : {}),
    };
  }

  private async call<T>(
    method: 'POST',
    path: string,
    schema: ZodType<T>,
    body: unknown,
    options: CallOptions,
  ): Promise<T> {
    if (!this.breaker.canRequest()) {
      throw new SmartMatchUnavailableError('circuit_open');
    }

    for (let attempt = 0; ; attempt += 1) {
      const started = performance.now();
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: this.headers(options.requestId),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch (error) {
        const reason =
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'timeout'
            : 'network';
        this.logger.warn(
          { path, attempt, reason, requestId: options.requestId },
          'SmartMatch sin respuesta',
        );
        if (attempt < options.retries) {
          await this.backoff(attempt);
          continue;
        }
        this.breaker.recordFailure();
        throw new SmartMatchUnavailableError(reason);
      }

      const durationMs = Math.round(performance.now() - started);
      if (response.ok) {
        const parsed = schema.safeParse(
          await response.json().catch(() => undefined),
        );
        if (!parsed.success) {
          this.breaker.recordFailure();
          this.logger.error(
            { path, requestId: options.requestId },
            'Contrato SmartMatch inválido',
          );
          throw new SmartMatchInvalidResponseError(parsed.error.message);
        }
        this.breaker.recordSuccess();
        this.logger.debug(
          { path, durationMs, requestId: options.requestId },
          'SmartMatch OK',
        );
        return parsed.data;
      }

      const upstreamCode = await this.readErrorCode(response);
      this.logger.warn(
        {
          path,
          status: response.status,
          upstreamCode,
          attempt,
          durationMs,
          requestId: options.requestId,
        },
        'SmartMatch respondió con error',
      );
      if (RETRYABLE_STATUS.has(response.status) && attempt < options.retries) {
        await this.backoff(attempt);
        continue;
      }
      if (response.status >= 500 || response.status === 429) {
        // 502 de la fuente web durante una ingesta no indica que el servicio esté caído.
        if (!upstreamCode?.startsWith('UPSTREAM_'))
          this.breaker.recordFailure();
        throw new SmartMatchUnavailableError(
          'upstream_status',
          response.status,
          upstreamCode,
        );
      }
      throw new SmartMatchRequestError(response.status, upstreamCode);
    }
  }

  private async readErrorCode(response: Response): Promise<string | undefined> {
    try {
      const data = (await response.json()) as { code?: unknown };
      return typeof data.code === 'string' ? data.code : undefined;
    } catch {
      return undefined;
    }
  }

  private backoff(attempt: number): Promise<void> {
    const delay =
      Math.min(1000, 100 * 2 ** attempt) + Math.floor(Math.random() * 50);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
