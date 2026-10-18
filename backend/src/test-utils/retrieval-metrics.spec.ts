import {
  evaluateQuery,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  summarize,
} from './retrieval-metrics.js';

const relevant = new Set(['a', 'c', 'x']);
const ranked = ['b', 'a', 'c', 'd', 'e'];

describe('métricas de recuperación', () => {
  it('Precision@K y Recall@K', () => {
    expect(precisionAtK(ranked, relevant, 3)).toBeCloseTo(2 / 3);
    expect(precisionAtK(ranked, relevant, 5)).toBeCloseTo(2 / 5);
    expect(recallAtK(ranked, relevant, 3)).toBeCloseTo(2 / 3);
    expect(recallAtK(ranked, new Set(), 3)).toBe(0);
    expect(precisionAtK(ranked, relevant, 0)).toBe(0);
  });

  it('rango recíproco', () => {
    expect(reciprocalRank(ranked, relevant)).toBe(0.5);
    expect(reciprocalRank(['z'], relevant)).toBe(0);
  });

  it('nDCG@K vale 1 con el orden ideal y menos si los relevantes bajan', () => {
    expect(ndcgAtK(['a', 'c', 'x', 'b'], relevant, 3)).toBeCloseTo(1);
    const worse = ndcgAtK(['b', 'd', 'a', 'c', 'x'], relevant, 5);
    expect(worse).toBeGreaterThan(0);
    expect(worse).toBeLessThan(1);
    expect(ndcgAtK(ranked, new Set(), 5)).toBe(0);
  });

  it('evalúa consultas y promedia', () => {
    const one = evaluateQuery('q1', 'avena', ['a', 'c'], ['a', 'c'], 5);
    const two = evaluateQuery('q2', 'x', [], ['a'], 5);
    expect(one).toMatchObject({ precisionAtK: 0.4, recall: 1, returned: 2 });
    expect(summarize([one, two])).toMatchObject({
      queries: 2,
      precisionAtK: 0.2,
      recall: 0.5,
      mrr: 0.5,
    });
    expect(summarize([]).mrr).toBe(0);
  });
});
