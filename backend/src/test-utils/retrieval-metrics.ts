/**
 * Métricas clásicas de recuperación de información con juicios binarios.
 * `ranked`: identificadores devueltos en orden; `relevant`: conjunto de identificadores relevantes.
 */

export function precisionAtK(
  ranked: string[],
  relevant: Set<string>,
  k: number,
): number {
  if (k <= 0) return 0;
  return ranked.slice(0, k).filter((id) => relevant.has(id)).length / k;
}

export function recallAtK(
  ranked: string[],
  relevant: Set<string>,
  k: number,
): number {
  if (relevant.size === 0) return 0;
  return (
    ranked.slice(0, k).filter((id) => relevant.has(id)).length / relevant.size
  );
}

/** Inverso de la posición del primer resultado relevante (0 si no aparece). */
export function reciprocalRank(
  ranked: string[],
  relevant: Set<string>,
): number {
  const index = ranked.findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

/** nDCG@k con ganancia binaria: premia los relevantes en las primeras posiciones. */
export function ndcgAtK(
  ranked: string[],
  relevant: Set<string>,
  k: number,
): number {
  const dcg = ranked
    .slice(0, k)
    .reduce(
      (sum, id, i) => sum + (relevant.has(id) ? 1 / Math.log2(i + 2) : 0),
      0,
    );
  const ideal = Array.from(
    { length: Math.min(k, relevant.size) },
    (_, i) => 1 / Math.log2(i + 2),
  ).reduce((a, b) => a + b, 0);
  return ideal === 0 ? 0 : dcg / ideal;
}

export interface QueryEvaluation {
  id: string;
  query: string;
  returned: number;
  precisionAtK: number;
  recallAtK: number;
  recall: number;
  reciprocalRank: number;
  ndcgAtK: number;
}

export function evaluateQuery(
  id: string,
  query: string,
  ranked: string[],
  relevantIds: string[],
  k: number,
): QueryEvaluation {
  const relevant = new Set(relevantIds);
  return {
    id,
    query,
    returned: ranked.length,
    precisionAtK: precisionAtK(ranked, relevant, k),
    recallAtK: recallAtK(ranked, relevant, k),
    recall: recallAtK(ranked, relevant, ranked.length),
    reciprocalRank: reciprocalRank(ranked, relevant),
    ndcgAtK: ndcgAtK(ranked, relevant, k),
  };
}

const round = (value: number) => Number(value.toFixed(3));

/** Promedios (macro) sobre todas las consultas: P@k, R@k, MRR y nDCG@k. */
export function summarize(results: QueryEvaluation[]) {
  const mean = (pick: (r: QueryEvaluation) => number) =>
    results.length
      ? round(results.reduce((sum, r) => sum + pick(r), 0) / results.length)
      : 0;
  return {
    queries: results.length,
    precisionAtK: mean((r) => r.precisionAtK),
    recallAtK: mean((r) => r.recallAtK),
    recall: mean((r) => r.recall),
    mrr: mean((r) => r.reciprocalRank),
    ndcgAtK: mean((r) => r.ndcgAtK),
  };
}
