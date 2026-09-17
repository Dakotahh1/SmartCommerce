import { ConfigService } from '@nestjs/config';
import {
  FakePythonService,
  rankedItemFixture,
} from '../../test-utils/fake-python-service.js';
import {
  SmartMatchClient,
  SmartMatchInvalidResponseError,
  SmartMatchRequestError,
  SmartMatchUnavailableError,
} from './smartmatch.client.js';
import type { RankRequest } from './smartmatch.contracts.js';

const TOKEN = 'internal-token-for-tests-0123456789abcdef';

const rankResponse = {
  engineVersion: '0.1.0',
  strategy: 'personalized',
  weightsUsed: { nutrition: 30 },
  learnedAdjustments: { nutrition: 0 },
  items: [rankedItemFixture('p1', '7802000014130', 1, 91.5)],
  excluded: [],
  stats: { candidates: 1, excluded: 0, ranked: 1, tookMs: 1.2 },
};

const payload: RankRequest = {
  strategy: 'personalized',
  profile: null,
  history: [],
  candidates: [],
  limit: 5,
  diversify: true,
};

function clientFor(baseUrl: string, overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    PYTHON_SERVICE_URL: baseUrl,
    INTERNAL_API_TOKEN: TOKEN,
    SMARTMATCH_TIMEOUT_MS: 300,
    SMARTMATCH_INGESTION_TIMEOUT_MS: 1000,
    SMARTMATCH_MAX_RETRIES: 2,
    SMARTMATCH_BREAKER_THRESHOLD: 2,
    SMARTMATCH_BREAKER_OPEN_MS: 60_000,
    ...overrides,
  };
  return new SmartMatchClient({
    get: (key: string) => values[key],
  } as unknown as ConfigService<never, true>);
}

describe('SmartMatchClient (integración HTTP con servicio simulado)', () => {
  const fake = new FakePythonService();
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await fake.start();
  });
  afterAll(() => fake.stop());
  beforeEach(() => fake.reset());

  it('envía token interno y request id, y valida el contrato de respuesta', async () => {
    fake.on('POST', '/v1/recommendations/rank', () => ({
      status: 200,
      body: rankResponse,
    }));
    const result = await clientFor(baseUrl).rank(payload, 'req-123');

    expect(result.items[0].score).toBe(91.5);
    expect(fake.requests[0].headers['x-internal-token']).toBe(TOKEN);
    expect(fake.requests[0].headers['x-request-id']).toBe('req-123');
    expect(fake.requests[0].body).toMatchObject({
      strategy: 'personalized',
      limit: 5,
    });
  });

  it('reintenta ante 503 y se recupera', async () => {
    let calls = 0;
    fake.on('POST', '/v1/recommendations/rank', () => {
      calls += 1;
      return calls < 3
        ? { status: 503, body: { code: 'X' } }
        : { status: 200, body: rankResponse };
    });
    await expect(clientFor(baseUrl).rank(payload)).resolves.toBeDefined();
    expect(calls).toBe(3);
  });

  it('corta por timeout, agota reintentos y reporta indisponibilidad', async () => {
    fake.on('POST', '/v1/recommendations/rank', () => ({
      status: 200,
      body: rankResponse,
      delayMs: 1000,
    }));
    const client = clientFor(baseUrl, { SMARTMATCH_MAX_RETRIES: 1 });
    const error = await client.rank(payload).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SmartMatchUnavailableError);
    expect((error as SmartMatchUnavailableError).reason).toBe('timeout');
    expect(fake.requests).toHaveLength(2);
  });

  it('trata una respuesta con contrato inválido como falla', async () => {
    fake.on('POST', '/v1/recommendations/rank', () => ({
      status: 200,
      body: { items: 'no-es-lista' },
    }));
    await expect(clientFor(baseUrl).rank(payload)).rejects.toBeInstanceOf(
      SmartMatchInvalidResponseError,
    );
  });

  it('no reintenta errores 4xx de contrato', async () => {
    fake.on('POST', '/v1/recommendations/rank', () => ({
      status: 422,
      body: { code: 'VALIDATION_ERROR' },
    }));
    const error = await clientFor(baseUrl)
      .rank(payload)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SmartMatchRequestError);
    expect((error as SmartMatchRequestError).upstreamCode).toBe(
      'VALIDATION_ERROR',
    );
    expect(fake.requests).toHaveLength(1);
  });

  it('abre el circuito tras fallas consecutivas y responde sin llamar al servicio', async () => {
    fake.on('POST', '/v1/recommendations/rank', () => ({
      status: 500,
      body: { code: 'INTERNAL_ERROR' },
    }));
    const client = clientFor(baseUrl, { SMARTMATCH_MAX_RETRIES: 0 });
    await expect(client.rank(payload)).rejects.toBeInstanceOf(
      SmartMatchUnavailableError,
    );
    await expect(client.rank(payload)).rejects.toBeInstanceOf(
      SmartMatchUnavailableError,
    );
    const requestsBefore = fake.requests.length;

    const error = await client.rank(payload).catch((e: unknown) => e);
    expect((error as SmartMatchUnavailableError).reason).toBe('circuit_open');
    expect(fake.requests.length).toBe(requestsBefore);
  });

  it('reporta red caída cuando el servicio no existe', async () => {
    const client = clientFor('http://127.0.0.1:9', {
      SMARTMATCH_MAX_RETRIES: 0,
    });
    const error = await client.rank(payload).catch((e: unknown) => e);
    expect((error as SmartMatchUnavailableError).reason).toBe('network');
  });

  it('una falla de la fuente web en la ingesta no abre el circuito', async () => {
    fake.on('POST', '/v1/ingestion/openfoodfacts/search', () => ({
      status: 502,
      body: { code: 'UPSTREAM_UNAVAILABLE' },
    }));
    const client = clientFor(baseUrl, { SMARTMATCH_BREAKER_THRESHOLD: 1 });
    const error = await client
      .ingestOpenFoodFacts({ country: 'chile', page: 1, pageSize: 10 })
      .catch((e: unknown) => e);

    expect((error as SmartMatchUnavailableError).upstreamCode).toBe(
      'UPSTREAM_UNAVAILABLE',
    );
    expect(client.breaker.currentState).toBe('closed');
    expect(fake.requests).toHaveLength(1);
  });

  it('consulta readiness de la fuente', async () => {
    fake.on('GET', '/health/ready', () => ({
      status: 200,
      body: {
        status: 'degraded',
        checks: { engine: 'up', openfoodfacts: 'down' },
        timestamp: 'x',
      },
    }));
    const readiness = await clientFor(baseUrl).readiness();
    expect(readiness.checks.openfoodfacts).toBe('down');
  });
});
