/**
 * Evaluación reproducible del buscador del catálogo (EP2 · evaluación de la información recuperada).
 *
 * 1. Ingiere por la API el corpus real normalizado por Python (`evaluation/retrieval/corpus.json`,
 *    23 cereales de Open Food Facts Chile) usando el flujo NestJS → "Python" → PostgreSQL.
 * 2. Ejecuta las consultas juzgadas de `evaluation/retrieval/queries.json` contra
 *    `GET /api/v1/products` con dos estrategias de orden sobre el mismo conjunto de coincidencias:
 *      - `relevance`: ts_rank_cd sobre search_vector (nombre/marca peso A, resto peso B);
 *      - `quality`: orden base de la EP1 (puntaje de calidad del dato).
 * 3. Calcula P@5, R@5, Recall, MRR y nDCG@5, guarda el reporte en `reports/` y exige que el
 *    ranking por relevancia supere umbrales mínimos y a la línea base.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { Role } from '../src/common/enums.js';
import { createDataSource } from '../src/database/data-source.js';
import { User } from '../src/database/entities/user.entity.js';
import { setupApp } from '../src/setup-app.js';
import { FakePythonService } from '../src/test-utils/fake-python-service.js';
import {
  evaluateQuery,
  summarize,
  type QueryEvaluation,
} from '../src/test-utils/retrieval-metrics.js';
import { FAKE_PYTHON_PORT } from './setup-env.js';

const EVALUATION_DIR = resolve(process.cwd(), '../evaluation/retrieval');
const corpus = JSON.parse(
  readFileSync(resolve(EVALUATION_DIR, 'corpus.json'), 'utf8'),
) as { report: unknown; products: { gtin: string }[] };
const judged = JSON.parse(
  readFileSync(resolve(EVALUATION_DIR, 'queries.json'), 'utf8'),
) as {
  k: number;
  queries: { id: string; query: string; relevant: string[] }[];
};

const STRATEGIES = ['relevance', 'quality'] as const;
const fake = new FakePythonService();

describe('Evaluación del buscador (Precision@K, MRR, nDCG)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    await fake.start(FAKE_PYTHON_PORT);
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
    await migrator.destroy();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    setupApp(app);
    await app.init();
    http = request(app.getHttpServer());

    // Operador que ingiere el corpus por la API (mismo flujo que en producción).
    const session = await http
      .post('/api/v1/auth/register')
      .send({
        email: 'operador@correo.cl',
        password: 'Clave-segura-2026',
        displayName: 'Operador',
      })
      .expect(201);
    await app
      .get<Repository<User>>(getRepositoryToken(User))
      .update({ id: session.body.user.id }, { role: Role.OPERATOR });
    const login = await http
      .post('/api/v1/auth/login')
      .send({ email: 'operador@correo.cl', password: 'Clave-segura-2026' })
      .expect(200);

    fake.on('POST', '/v1/ingestion/openfoodfacts/search', () => ({
      status: 200,
      body: {
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
          pageSize: 50,
        },
        fetchedAt: '2026-10-01T12:00:00+00:00',
        totalAvailable: corpus.products.length,
        products: corpus.products,
        report: corpus.report,
      },
    }));
    const run = await http
      .post('/api/v1/admin/ingestions')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ category: 'breakfast-cereals', pageSize: 50 })
      .expect(201);
    if (run.body.counts.inserted !== corpus.products.length) {
      throw new Error(`Corpus incompleto: ${JSON.stringify(run.body.counts)}`);
    }
  });

  afterAll(async () => {
    await app?.close();
    await fake.stop();
  });

  async function rankedGtins(query: string, sort: string): Promise<string[]> {
    const res = await http
      .get('/api/v1/products')
      .query({ q: query, sort, limit: 50 })
      .expect(200);
    return (res.body.items as { gtin: string }[]).map((p) => p.gtin);
  }

  it('el ranking por relevancia cumple los umbrales y supera la línea base', async () => {
    const results: Record<string, QueryEvaluation[]> = {};
    for (const strategy of STRATEGIES) {
      results[strategy] = [];
      for (const q of judged.queries) {
        const ranked = await rankedGtins(q.query, strategy);
        results[strategy].push(
          evaluateQuery(q.id, q.query, ranked, q.relevant, judged.k),
        );
      }
    }
    const summary = Object.fromEntries(
      STRATEGIES.map((s) => [s, summarize(results[s])]),
    ) as Record<(typeof STRATEGIES)[number], ReturnType<typeof summarize>>;

    const report = {
      generatedAt: new Date().toISOString(),
      corpusSize: corpus.products.length,
      k: judged.k,
      summary,
      perQuery: results,
    };
    mkdirSync(resolve(process.cwd(), 'reports'), { recursive: true });
    writeFileSync(
      resolve(process.cwd(), 'reports/retrieval-evaluation.json'),
      JSON.stringify(report, null, 2),
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      const k = judged.k;
      const rows = STRATEGIES.map(
        (s) =>
          `| ${s} | ${summary[s].precisionAtK} | ${summary[s].recallAtK} | ${summary[s].recall} | ${summary[s].mrr} | ${summary[s].ndcgAtK} |`,
      );
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          `### 🔎 Evaluación del buscador (${judged.queries.length} consultas, ${corpus.products.length} productos)`,
          `| Estrategia | P@${k} | R@${k} | Recall | MRR | nDCG@${k} |`,
          '|---|---|---|---|---|---|',
          ...rows,
          '',
        ].join('\n'),
      );
    }

    const relevance = summary.relevance;
    const baseline = summary.quality;
    // Mismo conjunto de coincidencias: el recall no depende del orden.
    expect(relevance.recall).toBe(baseline.recall);
    expect(relevance.recall).toBeGreaterThanOrEqual(0.8);
    expect(relevance.precisionAtK).toBeGreaterThanOrEqual(
      baseline.precisionAtK,
    );
    expect(relevance.ndcgAtK).toBeGreaterThan(baseline.ndcgAtK);
    expect(relevance.mrr).toBeGreaterThanOrEqual(0.8);
  });

  it('cada resultado por relevancia informa su puntaje y vienen ordenados', async () => {
    const res = await http
      .get('/api/v1/products')
      .query({ q: 'granola almendras' })
      .expect(200);
    const scores = (res.body.items as { relevance: number }[]).map(
      (p) => p.relevance,
    );
    expect(scores.length).toBeGreaterThan(0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // El producto que contiene ambos términos en el nombre queda primero.
    expect(res.body.items[0].gtin).toBe('7802000017803');
  });
});
