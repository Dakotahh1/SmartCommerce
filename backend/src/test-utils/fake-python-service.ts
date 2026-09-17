import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

export type Handler = (
  req: RecordedRequest,
) =>
  | { status: number; body?: unknown; delayMs?: number; raw?: string }
  | Promise<{ status: number; body?: unknown; delayMs?: number; raw?: string }>;

/**
 * Servidor HTTP real que simula el servicio Python para pruebas de integración NestJS ↔ FastAPI:
 * permite verificar contratos, cabeceras, timeouts, reintentos y respuestas inválidas.
 */
export class FakePythonService {
  readonly requests: RecordedRequest[] = [];
  private server?: Server;
  private readonly routes = new Map<string, Handler>();

  on(method: string, path: string, handler: Handler): this {
    this.routes.set(`${method} ${path}`, handler);
    return this;
  }

  reset(): void {
    this.requests.length = 0;
    this.routes.clear();
  }

  async start(requestedPort = 0): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) =>
      this.server!.listen(requestedPort, '127.0.0.1', resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    const path = (req.url ?? '/').split('?')[0];
    const recorded: RecordedRequest = {
      method: req.method ?? 'GET',
      path,
      headers: req.headers,
      body: text ? JSON.parse(text) : undefined,
    };
    this.requests.push(recorded);

    const handler = this.routes.get(`${recorded.method} ${path}`);
    if (!handler) {
      res
        .writeHead(404, { 'Content-Type': 'application/json' })
        .end('{"code":"NOT_FOUND"}');
      return;
    }
    const result = await handler(recorded);
    if (result.delayMs)
      await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    if (res.destroyed) return;
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(result.raw ?? JSON.stringify(result.body ?? {}));
  }
}

export function rankedItemFixture(
  productId: string,
  gtin: string,
  rank: number,
  score: number,
) {
  return {
    productId,
    gtin,
    rank,
    score,
    coverage: 1,
    breakdown: [
      {
        criterion: 'nutrition',
        label: 'Nutrición',
        value: 0.8,
        weight: 0.3,
        contribution: 24,
      },
    ],
    reasons: ['Nutri-Score B'],
    warnings: [],
  };
}
