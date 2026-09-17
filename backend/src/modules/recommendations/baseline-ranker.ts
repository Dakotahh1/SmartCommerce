import type { Criterion } from '../../common/enums.js';
import type { ProductCandidate } from '../smartmatch/smartmatch.contracts.js';

/**
 * Respaldo en TypeScript de la versión BASE (no adaptativa) de SmartMatch.
 * Se usa solo si el servicio Python no responde (degradación controlada).
 * Replica la especificación de docs/05-motor-smartmatch.md §5.5:
 * pesos fijos, renormalización ante datos faltantes y factor de confianza.
 */
export const BASELINE_WEIGHTS: Record<Criterion, number> = {
  nutrition: 40,
  price: 0,
  processing: 30,
  environment: 20,
  availability: 10,
};

const GRADE_VALUES: Record<string, number> = {
  a: 1,
  b: 0.8,
  c: 0.55,
  d: 0.3,
  e: 0.1,
};
const NOVA_VALUES: Record<number, number> = { 1: 1, 2: 0.8, 3: 0.5, 4: 0.15 };
const LABELS: Record<Criterion, string> = {
  nutrition: 'Nutrición',
  price: 'Precio por unidad',
  processing: 'Procesamiento',
  environment: 'Impacto ambiental',
  availability: 'Disponibilidad',
};

export interface BaselineItem {
  productId: string;
  gtin: string;
  rank: number;
  score: number;
  coverage: number;
  breakdown: Array<{
    criterion: Criterion;
    label: string;
    value: number | null;
    weight: number;
    contribution: number;
  }>;
  reasons: string[];
  warnings: string[];
}

function values(product: ProductCandidate): Record<Criterion, number | null> {
  const seals = product.highInSeals.length;
  const nutritionFromSeals =
    product.nutriments &&
    ['energyKcal', 'sugars', 'saturatedFat', 'sodiumMg'].every(
      (k) => (product.nutriments?.[k] ?? null) !== null,
    )
      ? Math.max(0.1, 0.9 - 0.2 * seals)
      : null;
  return {
    nutrition: product.nutriscoreGrade
      ? GRADE_VALUES[product.nutriscoreGrade]
      : nutritionFromSeals,
    price: null,
    processing: product.novaGroup
      ? (NOVA_VALUES[product.novaGroup] ?? null)
      : null,
    environment: product.ecoscoreGrade
      ? GRADE_VALUES[product.ecoscoreGrade]
      : null,
    availability: product.stores.length
      ? Math.min(1, product.stores.length / 5)
      : null,
  };
}

export function scoreBaseline(
  product: ProductCandidate,
): Omit<BaselineItem, 'rank'> {
  const vals = values(product);
  const criteria = Object.keys(BASELINE_WEIGHTS) as Criterion[];
  const total = criteria.reduce((sum, c) => sum + BASELINE_WEIGHTS[c], 0);
  const available = criteria.filter(
    (c) => vals[c] !== null && BASELINE_WEIGHTS[c] > 0,
  );
  const availableWeight = available.reduce(
    (sum, c) => sum + BASELINE_WEIGHTS[c],
    0,
  );
  const coverage = total ? availableWeight / total : 0;
  const confidence = 0.7 + 0.3 * coverage;
  const base = availableWeight
    ? available.reduce(
        (sum, c) => sum + BASELINE_WEIGHTS[c] * (vals[c] ?? 0),
        0,
      ) / availableWeight
    : 0;
  const score =
    Math.round(1000 * Math.min(1, Math.max(0, base * confidence))) / 10;

  return {
    productId: product.id,
    gtin: product.gtin,
    score,
    coverage: Math.round(coverage * 1000) / 1000,
    breakdown: criteria.map((criterion) => ({
      criterion,
      label: LABELS[criterion],
      value: vals[criterion],
      weight: Math.round((BASELINE_WEIGHTS[criterion] / total) * 1000) / 1000,
      contribution:
        vals[criterion] !== null && available.includes(criterion)
          ? Math.round(
              (1000 *
                confidence *
                BASELINE_WEIGHTS[criterion] *
                (vals[criterion] ?? 0)) /
                availableWeight,
            ) / 10
          : 0,
    })),
    reasons: [
      ...(product.nutriscoreGrade &&
      GRADE_VALUES[product.nutriscoreGrade] >= 0.8
        ? [`Nutri-Score ${product.nutriscoreGrade.toUpperCase()}`]
        : []),
      ...(product.novaGroup === 1
        ? ['NOVA 1: sin procesar o mínimamente procesado']
        : []),
    ],
    warnings: [
      'Orden básico sin personalización (motor SmartMatch no disponible)',
    ],
  };
}

export function rankBaseline(
  candidates: ProductCandidate[],
  limit: number,
): BaselineItem[] {
  return candidates
    .map(scoreBaseline)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (candidates.find((c) => c.gtin === b.gtin)?.dataQualityScore ?? 0) -
          (candidates.find((c) => c.gtin === a.gtin)?.dataQualityScore ?? 0) ||
        a.gtin.localeCompare(b.gtin),
    )
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
