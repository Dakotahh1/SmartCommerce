/**
 * Pruebas de integración de extremo a extremo del backend:
 * HTTP (supertest) → NestJS → PostgreSQL real → servicio Python simulado por HTTP.
 *
 * Requiere una base de datos PostgreSQL vacía accesible con las variables DB_*.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { Role } from '../src/common/enums.js';
import { createDataSource } from '../src/database/data-source.js';
import { User } from '../src/database/entities/user.entity.js';
import { setupApp } from '../src/setup-app.js';
import { FakePythonService } from '../src/test-utils/fake-python-service.js';
import { FAKE_PYTHON_PORT } from './setup-env.js';

const fake = new FakePythonService();
const PASSWORD = 'Clave-segura-2026';

function normalizedProduct(
  gtin: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  return {
    gtin,
    name,
    brand: 'Quaker',
    categories: ['breakfast-cereals'],
    mainCategory: 'breakfast-cereals',
    quantityText: '700 g',
    netQuantity: 700,
    unit: 'g',
    isBeverage: false,
    imageUrl: null,
    nutriscoreGrade: 'b',
    novaGroup: 1,
    ecoscoreGrade: 'b',
    nutriments: {
      energyKcal: 380,
      sugars: 1,
      saturatedFat: 1.9,
      sodiumMg: 4,
      salt: null,
      proteins: 13,
      fiber: null,
    },
    highInSeals: [],
    allergens: ['gluten'],
    traces: [],
    labels: [],
    diets: {
      vegan: null,
      vegetarian: true,
      glutenFree: false,
      lactoseFree: null,
    },
    stores: ['lider'],
    countries: ['chile'],
    completeness: 0.8,
    dataQualityScore: 0.75,
    warnings: [],
    source: {
      code: 'openfoodfacts',
      name: 'Open Food Facts',
      url: `https://world.openfoodfacts.org/product/${gtin}`,
      license: 'ODbL-1.0',
      lastModifiedAt: '2026-04-07T12:00:00+00:00',
      fetchedAt: '2026-09-17T12:00:00+00:00',
    },
    rawHash: 'a'.repeat(64),
    ...extra,
  };
}

function ingestionResponse(products: unknown[]) {
  return {
    source: {
      code: 'openfoodfacts',
      name: 'Open Food Facts',
      apiUrl:
        'https://world.openfoodfacts.org/api/v2/search?countries_tags_en=chile',
      license: 'ODbL-1.0',
      termsUrl: 'https://world.openfoodfacts.org/terms-of-use',
    },
    request: {
      country: 'chile',
      category: 'breakfast-cereals',
      brand: null,
      page: 1,
      pageSize: 2,
    },
    fetchedAt: '2026-09-17T12:00:00+00:00',
    totalAvailable: 117,
    products,
    report: {
      received: 3,
      valid: products.length,
      rejected: 1,
      duplicates: 0,
      warnings: 0,
      validRatio: 0.667,
      duplicateRatio: 0,
      fieldCoverage: { brand: 1 },
      rejections: [{ index: 2, code: null, reason: 'Producto sin nombre' }],
      tookMs: 3.2,
    },
  };
}

describe('SmartCommerce API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let users: Repository<User>;

  beforeAll(async () => {
    await fake.start(FAKE_PYTHON_PORT);

    // Esquema limpio: migraciones down + up (verifica también la reversibilidad).
    const migrator = createDataSource({
      DB_HOST: process.env.DB_HOST!,
      DB_PORT: Number(process.env.DB_PORT),
      DB_NAME: process.env.DB_NAME!,
      DB_USER: process.env.DB_USER!,
      DB_PASSWORD: process.env.DB_PASSWORD!,
      DB_SSL: false,
      DB_POOL_MAX: 2,
    });
    await migrator.initialize();
    await migrator.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrator.runMigrations();
    await migrator.undoLastMigration();
    await migrator.runMigrations();
    await migrator.destroy();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    setupApp(app);
    await app.init();
    http = request(app.getHttpServer());
    users = app.get<Repository<User>>(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app?.close();
    await fake.stop();
  });

  beforeEach(() => fake.reset());

  async function register(email: string) {
    const res = await http
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, displayName: 'Persona de prueba' })
      .expect(201);
    return res.body as {
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    };
  }

  async function loginAs(email: string) {
    const res = await http
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('GET /api/health informa estado degradado si SmartMatch no responde, sin caer', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('up');
    expect(res.body.checks.smartmatch.status).toBe('down');
    expect(res.headers['x-request-id']).toBeDefined();

    fake.on('GET', '/health/ready', () => ({
      status: 200,
      body: { status: 'ok', checks: { engine: 'up', openfoodfacts: 'up' } },
    }));
    const healthy = await http
      .get('/api/health')
      .set('X-Request-Id', 'e2e-health-1')
      .expect(200);
    expect(healthy.body.status).toBe('ok');
    expect(fake.requests.at(-1)?.headers['x-request-id']).toBe('e2e-health-1');
    await http.get('/api/health/live').expect(200);
  });

  it('flujo de autenticación: registro, sesión, rotación, reutilización y cierre', async () => {
    const session = await register('Flujo@Correo.CL');
    await http
      .post('/api/v1/auth/register')
      .send({
        email: 'flujo@correo.cl',
        password: PASSWORD,
        displayName: 'Otra',
      })
      .expect(409);

    const me = await http
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email: 'flujo@correo.cl', role: 'user' });
    expect(me.body.passwordHash).toBeUndefined();

    const bad = await http
      .post('/api/v1/auth/login')
      .send({ email: 'flujo@correo.cl', password: 'incorrecta1' })
      .expect(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');

    const rotated = await http
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(session.refreshToken);

    const reused = await http
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    expect(reused.body.code).toBe('REFRESH_TOKEN_REUSED');
    await http
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);

    const fresh = await loginAs('flujo@correo.cl');
    await http
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${fresh.accessToken}`)
      .send({ refreshToken: fresh.refreshToken })
      .expect(204);
    await http
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: fresh.refreshToken })
      .expect(401);

    await http.get('/api/v1/auth/me').expect(401);
    await http
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer token-falso')
      .expect(401);
  });

  it('validación de DTO y formato de error uniforme', async () => {
    const res = await http
      .post('/api/v1/auth/register')
      .set('X-Request-Id', 'e2e-validation')
      .send({
        email: 'no-es-correo',
        password: 'corta',
        displayName: 'X',
        role: 'admin',
      })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      path: '/api/v1/auth/register',
      requestId: 'e2e-validation',
    });
    expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['email', 'password', 'role']),
    );
  });

  it('autorización: un usuario no accede a administración; un admin ingesta desde la fuente web', async () => {
    const regular = await register('usuario@correo.cl');
    await http
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${regular.accessToken}`)
      .expect(403);
    await http
      .post('/api/v1/admin/ingestions')
      .set('Authorization', `Bearer ${regular.accessToken}`)
      .send({})
      .expect(403);

    const adminSession = await register('admin@correo.cl');
    await users.update({ id: adminSession.user.id }, { role: Role.ADMIN });
    const admin = await loginAs('admin@correo.cl');

    fake.on('POST', '/v1/ingestion/openfoodfacts/search', () => ({
      status: 200,
      body: ingestionResponse([
        normalizedProduct('7802000014130', 'Avena Instantánea'),
        normalizedProduct('7804000001431', 'Hojuelas sabor chocolate', {
          brand: 'Enlinea',
          novaGroup: 4,
          rawHash: 'b'.repeat(64),
        }),
      ]),
    }));
    const run = await http
      .post('/api/v1/admin/ingestions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ category: 'breakfast-cereals', pageSize: 2 })
      .expect(201);
    expect(run.body).toMatchObject({
      status: 'completed',
      counts: { inserted: 2, rejected: 1 },
    });
    expect(fake.requests[0].headers['x-internal-token']).toBe(
      process.env.INTERNAL_API_TOKEN,
    );

    const again = await http
      .post('/api/v1/admin/ingestions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ category: 'breakfast-cereals', pageSize: 2 })
      .expect(201);
    expect(again.body.counts).toMatchObject({ inserted: 0, unchanged: 2 });

    fake.on('POST', '/v1/ingestion/openfoodfacts/search', () => ({
      status: 502,
      body: { code: 'UPSTREAM_UNAVAILABLE' },
    }));
    const failed = await http
      .post('/api/v1/admin/ingestions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({})
      .expect(502);
    expect(failed.body.code).toBe('SOURCE_UNAVAILABLE');

    const runs = await http
      .get('/api/v1/admin/ingestions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(runs.body.items.map((r: { status: string }) => r.status)).toEqual([
      'failed',
      'completed',
      'completed',
    ]);
  });

  it('catálogo público con búsqueda, filtros, detalle y procedencia', async () => {
    const list = await http
      .get('/api/v1/products')
      .query({ q: 'avena' })
      .expect(200);
    expect(list.body.total).toBe(1);
    const [product] = list.body.items;
    expect(product).toMatchObject({
      gtin: '7802000014130',
      category: 'breakfast-cereals',
      nutriscoreGrade: 'b',
    });

    const filtered = await http
      .get('/api/v1/products')
      .query({ maxNova: 2, excludeAllergens: 'milk' })
      .expect(200);
    expect(filtered.body.items.map((p: { gtin: string }) => p.gtin)).toEqual([
      '7802000014130',
    ]);

    const detail = await http.get(`/api/v1/products/${product.id}`).expect(200);
    expect(detail.body.provenance[0]).toMatchObject({
      code: 'openfoodfacts',
      license: 'ODbL-1.0',
    });

    await http
      .get('/api/v1/products/00000000-0000-4000-8000-000000000000')
      .expect(404);
    await http.get('/api/v1/products/no-es-uuid').expect(400);
    const categories = await http.get('/api/v1/categories').expect(200);
    expect(categories.body[0]).toMatchObject({
      slug: 'breakfast-cereals',
      productCount: 2,
    });
  });

  it('flujo Angular → NestJS → Python → NestJS: preferencias, interacciones, recomendaciones y degradación', async () => {
    const session = await register('camila@correo.cl');
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    await http
      .put('/api/v1/me/preferences')
      .set(auth)
      .send({
        weights: {
          nutrition: 40,
          price: 20,
          processing: 20,
          environment: 10,
          availability: 10,
        },
        diets: [],
        excludedAllergens: ['peanuts'],
        avoidHighIn: true,
        preferredStores: ['lider'],
        personalizationEnabled: true,
      })
      .expect(200);

    const products = (await http.get('/api/v1/products').expect(200)).body
      .items as Array<{ id: string; gtin: string }>;
    await http
      .post('/api/v1/interactions')
      .set(auth)
      .send({
        productId: products[0].id,
        type: 'favorite',
        context: { screen: 'explore' },
      })
      .expect(201);
    const favorites = await http
      .get('/api/v1/me/favorites')
      .set(auth)
      .expect(200);
    expect(favorites.body).toHaveLength(1);

    fake.on('POST', '/v1/recommendations/rank', (req) => {
      const body = req.body as {
        candidates: Array<{ id: string; gtin: string }>;
      };
      return {
        status: 200,
        body: {
          engineVersion: '0.1.0',
          strategy: 'personalized',
          weightsUsed: { nutrition: 42 },
          learnedAdjustments: { nutrition: 2 },
          excluded: [],
          stats: {
            candidates: body.candidates.length,
            excluded: 0,
            ranked: 1,
            tookMs: 2,
          },
          items: [
            {
              productId: body.candidates[0].id,
              gtin: body.candidates[0].gtin,
              rank: 1,
              score: 90.1,
              coverage: 1,
              breakdown: [
                {
                  criterion: 'nutrition',
                  label: 'Nutrición',
                  value: 0.8,
                  weight: 0.4,
                  contribution: 32,
                },
              ],
              reasons: ['Nutri-Score B'],
              warnings: [],
            },
          ],
        },
      };
    });
    const recs = await http
      .get('/api/v1/recommendations')
      .set(auth)
      .query({ limit: 5 })
      .expect(200);
    expect(recs.body).toMatchObject({
      strategy: 'personalized',
      degraded: false,
    });
    expect(recs.body.items[0].product.gtin).toBeDefined();

    const sent = fake.requests.find(
      (r) => r.path === '/v1/recommendations/rank',
    )?.body as {
      profile: { excludedAllergens: string[] };
      history: Array<{ type: string }>;
    };
    expect(sent.profile.excludedAllergens).toEqual(['peanuts']);
    expect(sent.history[0].type).toBe('favorite');

    await fake.stop(); // el servicio Python cae: sin conexión
    const degraded = await http
      .get('/api/v1/recommendations')
      .set(auth)
      .expect(200);
    expect(degraded.body).toMatchObject({
      strategy: 'baseline',
      degraded: true,
    });
    expect(degraded.body.items.length).toBeGreaterThan(0);

    const comparison = await http
      .post('/api/v1/comparisons')
      .send({ productIds: products.map((p) => p.id) })
      .expect(200);
    expect(comparison.body.degraded).toBe(true);
    expect(comparison.body.winnerGtin).toBe('7802000014130');

    await fake.start(FAKE_PYTHON_PORT);
    fake.on('POST', '/v1/recommendations/rank', () => ({
      status: 404,
      body: { code: 'NOT_FOUND' },
    }));
    const contractError = await http
      .get('/api/v1/recommendations')
      .set(auth)
      .expect(200);
    expect(contractError.body.degraded).toBe(true);

    await http.delete('/api/v1/me/interactions').set(auth).expect(204);
    expect(
      (await http.get('/api/v1/me/interactions').set(auth).expect(200)).body,
    ).toHaveLength(0);

    await http
      .delete('/api/v1/auth/me')
      .set(auth)
      .send({ password: PASSWORD })
      .expect(204);
    await http
      .post('/api/v1/auth/login')
      .send({ email: 'camila@correo.cl', password: PASSWORD })
      .expect(401);
  });

  it('documentación OpenAPI disponible', async () => {
    const res = await http.get('/api/docs-json').expect(200);
    expect(res.body.info.title).toBe('SmartCommerce API');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/v1/auth/login', '/api/v1/recommendations']),
    );
  });

  it('métricas solo para administradores', async () => {
    const regular = await loginAs('usuario@correo.cl');
    await http
      .get('/api/health/metrics')
      .set('Authorization', `Bearer ${regular.accessToken}`)
      .expect(403);
    const admin = await loginAs('admin@correo.cl');
    const metrics = await http
      .get('/api/health/metrics')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(
      metrics.body.routes['POST /api/v1/auth/login'].count,
    ).toBeGreaterThan(0);
  });
});
