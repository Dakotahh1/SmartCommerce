import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { SILENT_ERRORS } from './http-context';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/v1`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('serializa filtros del catálogo omitiendo valores vacíos', () => {
    api
      .searchProducts({
        q: 'avena',
        nutriscore: ['a', 'b'],
        excludeAllergens: [],
        maxNova: 2,
        category: undefined,
        page: 1,
        limit: 20,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${base}/products`);
    expect(req.request.params.keys().sort()).toEqual([
      'limit',
      'maxNova',
      'nutriscore',
      'page',
      'q',
    ]);
    expect(req.request.params.get('nutriscore')).toBe('a,b');
    req.flush({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('solicita recomendaciones y comparaciones con los contratos de la API', () => {
    api.getRecommendations(5, 'breakfast-cereals').subscribe();
    const rec = http.expectOne((r) => r.url === `${base}/recommendations`);
    expect(rec.request.params.get('limit')).toBe('5');
    expect(rec.request.params.get('category')).toBe('breakfast-cereals');
    rec.flush({});

    api.compare(['p1', 'p2']).subscribe();
    const cmp = http.expectOne(`${base}/comparisons`);
    expect(cmp.request.method).toBe('POST');
    expect(cmp.request.body).toEqual({ productIds: ['p1', 'p2'] });
    cmp.flush({});
  });

  it('no envía campos de solo lectura al actualizar preferencias', () => {
    api
      .updatePreferences({
        weights: { nutrition: 30, price: 25, processing: 20, environment: 15, availability: 10 },
        diets: [],
        excludedAllergens: [],
        avoidHighIn: false,
        preferredStores: [],
        personalizationEnabled: true,
        updatedAt: '2026-09-17',
      })
      .subscribe();
    const req = http.expectOne(`${base}/me/preferences`);
    expect(req.request.body).not.toHaveProperty('updatedAt');
    req.flush({});
  });

  it('las interacciones son silenciosas (no interrumpen al usuario si fallan)', () => {
    api.recordInteraction('p1', 'favorite', 'detail').subscribe({ error: () => undefined });
    const req = http.expectOne(`${base}/interactions`);
    expect(req.request.body).toEqual({
      productId: 'p1',
      type: 'favorite',
      context: { screen: 'detail' },
    });
    expect(req.request.context.get(SILENT_ERRORS)).toBe(true);
    req.flush({});
  });
});
