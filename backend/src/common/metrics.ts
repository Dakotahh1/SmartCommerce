import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';

interface RouteStats {
  count: number;
  errors5xx: number;
  durations: number[];
}

const WINDOW = 500;

/** Métricas básicas en memoria por ruta: solicitudes, errores 5xx, latencia promedio y p95. */
@Injectable()
export class MetricsRegistry {
  readonly startedAt = Date.now();
  private readonly routes = new Map<string, RouteStats>();

  observe(route: string, statusCode: number, durationMs: number): void {
    const stats = this.routes.get(route) ?? {
      count: 0,
      errors5xx: 0,
      durations: [],
    };
    stats.count += 1;
    if (statusCode >= 500) stats.errors5xx += 1;
    stats.durations.push(durationMs);
    if (stats.durations.length > WINDOW) stats.durations.shift();
    this.routes.set(route, stats);
  }

  snapshot() {
    const routes: Record<
      string,
      { count: number; errors5xx: number; avgMs: number; p95Ms: number }
    > = {};
    for (const [route, stats] of [...this.routes.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const sorted = [...stats.durations].sort((a, b) => a - b);
      const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
      const avg = sorted.length
        ? sorted.reduce((sum, d) => sum + d, 0) / sorted.length
        : 0;
      routes[route] = {
        count: stats.count,
        errors5xx: stats.errors5xx,
        avgMs: Math.round(avg * 100) / 100,
        p95Ms: Math.round(p95 * 100) / 100,
      };
    }
    return {
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      routes,
    };
  }
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly registry: MetricsRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const started = performance.now();
    const route = `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? request.path}`;

    return next.handle().pipe(
      finalize(() => {
        const duration = performance.now() - started;
        this.registry.observe(route, response.statusCode, duration);
        response.setHeader('X-Response-Time-Ms', duration.toFixed(1));
      }),
    );
  }
}
