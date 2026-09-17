import type { ProductCandidate } from '../smartmatch/smartmatch.contracts.js';
import { rankBaseline, scoreBaseline } from './baseline-ranker.js';

function candidate(
  overrides: Partial<ProductCandidate> = {},
): ProductCandidate {
  return {
    id: 'p1',
    gtin: '7802000014130',
    name: 'Avena Instantánea',
    brand: 'Quaker',
    mainCategory: 'breakfast-cereals',
    nutriscoreGrade: 'b',
    novaGroup: 1,
    ecoscoreGrade: 'b',
    nutriments: { energyKcal: 380, sugars: 1, saturatedFat: 1.9, sodiumMg: 4 },
    highInSeals: [],
    allergens: ['gluten'],
    labels: [],
    diets: {},
    stores: ['lider', 'jumbo', 'unimarc'],
    unitPrice: 3557,
    priceUnit: 'kg',
    dataQualityScore: 0.8,
    ...overrides,
  };
}

describe('Ranking base (respaldo no adaptativo)', () => {
  it('replica la fórmula documentada: pesos fijos 40/30/20/10 sin precio', () => {
    const item = scoreBaseline(candidate());
    // (40·0,8 + 30·1 + 20·0,8 + 10·0,6) / 100 = 0,84 ; cobertura 1 → 84,0
    expect(item.score).toBe(84);
    expect(item.coverage).toBe(1);
    expect(item.breakdown.find((b) => b.criterion === 'price')).toMatchObject({
      value: null,
      weight: 0,
    });
    expect(item.reasons).toEqual([
      'Nutri-Score B',
      'NOVA 1: sin procesar o mínimamente procesado',
    ]);
  });

  it('renormaliza y penaliza datos faltantes', () => {
    const item = scoreBaseline(candidate({ ecoscoreGrade: null, stores: [] }));
    // base = (40·0,8 + 30·1)/70 = 0,8857 ; cobertura 0,7 → confianza 0,91 → 80,6
    expect(item.coverage).toBe(0.7);
    expect(item.score).toBe(80.6);
  });

  it('usa los sellos cuando no hay Nutri-Score', () => {
    const item = scoreBaseline(
      candidate({ nutriscoreGrade: null, highInSeals: ['sugars', 'calories'] }),
    );
    expect(
      item.breakdown.find((b) => b.criterion === 'nutrition')?.value,
    ).toBeCloseTo(0.5);
  });

  it('ordena por puntaje, calidad de datos y GTIN, y aplica el límite', () => {
    const ranked = rankBaseline(
      [
        candidate({ id: 'low', gtin: '1', nutriscoreGrade: 'e', novaGroup: 4 }),
        candidate({ id: 'tie-a', gtin: '3', dataQualityScore: 0.5 }),
        candidate({ id: 'tie-b', gtin: '2', dataQualityScore: 0.9 }),
      ],
      2,
    );
    expect(ranked.map((r) => r.productId)).toEqual(['tie-b', 'tie-a']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('sin ningún dato el puntaje es 0', () => {
    const item = scoreBaseline(
      candidate({
        nutriscoreGrade: null,
        nutriments: null,
        novaGroup: null,
        ecoscoreGrade: null,
        stores: [],
      }),
    );
    expect(item.score).toBe(0);
    expect(item.coverage).toBe(0);
  });
});
