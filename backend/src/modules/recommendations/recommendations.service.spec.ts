import type { Repository } from 'typeorm';
import { Role } from '../../common/enums.js';
import type { RecommendationLog } from '../../database/entities/activity.entities.js';
import type { Product } from '../../database/entities/catalog.entities.js';
import type { UserPreferences } from '../../database/entities/user-preferences.entity.js';
import type { ProductsService } from '../catalog/products.service.js';
import type { InteractionsService } from '../interactions/interactions.service.js';
import type { PreferencesService } from '../preferences/preferences.service.js';
import type { ProductWithContext } from '../smartmatch/candidate.mapper.js';
import {
  SmartMatchClient,
  SmartMatchUnavailableError,
} from '../smartmatch/smartmatch.client.js';
import {
  DEGRADED_NOTICE,
  RecommendationsService,
} from './recommendations.service.js';

const user = { id: 'u1', email: 'a@b.cl', role: Role.USER };

function product(
  id: string,
  gtin: string,
  overrides: Partial<Product> = {},
): ProductWithContext {
  return {
    product: {
      id,
      gtin,
      name: `Producto ${id}`,
      brand: 'Marca',
      categoryId: 1,
      quantityText: '700 g',
      netQuantity: 700,
      unit: 'g',
      isBeverage: false,
      imageUrl: null,
      nutriscoreGrade: 'b',
      novaGroup: 1,
      ecoscoreGrade: 'b',
      nutriments: {},
      allergens: [],
      traces: [],
      labels: [],
      diets: {},
      highInSeals: [],
      stores: [],
      completeness: 0.8,
      dataQualityScore: 0.8,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Product,
    categorySlug: 'breakfast-cereals',
    latestPrice: null,
  };
}

function setup(
  rank: SmartMatchClient['rank'],
  prefs: Partial<UserPreferences> = {},
) {
  const items = [
    product('p1', '7802000014130', { nutriscoreGrade: 'e' }),
    product('p2', '7804000001431'),
  ];
  const saved: unknown[] = [];
  const products = {
    candidates: vi.fn().mockResolvedValue(items),
    toSummary: (ctx: ProductWithContext) => ({
      id: ctx.product.id,
      name: ctx.product.name,
    }),
  } as unknown as ProductsService;
  const preferences = {
    getOrCreate: vi.fn().mockResolvedValue({
      userId: 'u1',
      weights: {
        nutrition: 30,
        price: 25,
        processing: 20,
        environment: 15,
        availability: 10,
      },
      diets: [],
      excludedAllergens: [],
      avoidHighIn: false,
      preferredStores: [],
      personalizationEnabled: true,
      ...prefs,
    }),
  } as unknown as PreferencesService;
  const interactions = {
    historyForEngine: vi.fn().mockResolvedValue([]),
  } as unknown as InteractionsService;
  const client = { rank } as unknown as SmartMatchClient;
  const logs = {
    create: (x: unknown) => x,
    save: vi.fn(async (x: unknown) => saved.push(x)),
  } as unknown as Repository<RecommendationLog>;
  return {
    service: new RecommendationsService(
      products,
      preferences,
      interactions,
      client,
      logs,
    ),
    saved,
    interactions,
  };
}

describe('RecommendationsService', () => {
  it('usa SmartMatch personalizado y registra la recomendación', async () => {
    const rank = vi.fn().mockResolvedValue({
      engineVersion: '0.1.0',
      strategy: 'personalized',
      weightsUsed: {},
      learnedAdjustments: {},
      excluded: [],
      stats: { candidates: 2, excluded: 0, ranked: 1, tookMs: 1 },
      items: [
        {
          productId: 'p2',
          gtin: '7804000001431',
          rank: 1,
          score: 88,
          coverage: 1,
          breakdown: [],
          reasons: [],
          warnings: [],
        },
      ],
    });
    const { service, saved, interactions } = setup(rank);
    const result = await service.recommend(user, { limit: 5 }, 'req-1');

    expect(result).toMatchObject({
      strategy: 'personalized',
      degraded: false,
      notice: null,
    });
    expect(result.items[0]).toMatchObject({
      productId: 'p2',
      product: { id: 'p2' },
    });
    expect(rank.mock.calls[0][0]).toMatchObject({
      strategy: 'personalized',
      limit: 5,
    });
    expect(interactions.historyForEngine).toHaveBeenCalledWith('u1');
    expect(saved[0]).toMatchObject({
      strategy: 'personalized',
      degraded: false,
      itemCount: 1,
      requestId: 'req-1',
    });
  });

  it('degrada de forma controlada si SmartMatch no está disponible', async () => {
    const { service, saved } = setup(
      vi.fn().mockRejectedValue(new SmartMatchUnavailableError('timeout')),
    );
    const result = await service.recommend(user, { limit: 5 });

    expect(result).toMatchObject({
      strategy: 'baseline',
      degraded: true,
      notice: DEGRADED_NOTICE,
    });
    expect(result.items.map((i) => i.productId)).toEqual(['p2', 'p1']);
    expect(saved[0]).toMatchObject({
      degraded: true,
      engineVersion: 'fallback',
    });
  });

  it('respeta la personalización desactivada (versión base sin historial)', async () => {
    const rank = vi
      .fn()
      .mockRejectedValue(new SmartMatchUnavailableError('network'));
    const { service, interactions } = setup(rank, {
      personalizationEnabled: false,
    });
    await service.recommend(user, { limit: 5 });
    expect(interactions.historyForEngine).not.toHaveBeenCalled();
    expect(rank.mock.calls[0][0]).toMatchObject({
      strategy: 'baseline',
      profile: null,
      history: [],
    });
  });

  it('propaga errores que no son del motor', async () => {
    const { service } = setup(vi.fn().mockRejectedValue(new TypeError('bug')));
    await expect(service.recommend(user, { limit: 5 })).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});
