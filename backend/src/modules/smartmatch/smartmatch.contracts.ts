import { z } from 'zod';
import type {
  Allergen,
  Criterion,
  Diet,
  Grade,
  HighInSeal,
  InteractionType,
} from '../../common/enums.js';

/*
 * Contratos con el servicio Python (camelCase). Las solicitudes se tipan en TypeScript y
 * las respuestas se VALIDAN en tiempo de ejecución: una respuesta inválida se trata como falla.
 */

export interface ProductCandidate {
  id: string;
  gtin: string;
  name: string;
  brand: string | null;
  mainCategory: string | null;
  nutriscoreGrade: Grade | null;
  novaGroup: number | null;
  ecoscoreGrade: Grade | null;
  nutriments: Record<string, number | null> | null;
  highInSeals: HighInSeal[];
  allergens: string[];
  labels: string[];
  diets: {
    vegan?: boolean | null;
    vegetarian?: boolean | null;
    glutenFree?: boolean | null;
    lactoseFree?: boolean | null;
  };
  stores: string[];
  unitPrice: number | null;
  priceUnit: 'kg' | 'l' | null;
  dataQualityScore: number;
}

export interface EngineProfile {
  weights: Record<Criterion, number>;
  diets: Diet[];
  excludedAllergens: Allergen[];
  avoidHighIn: boolean;
  preferredStores: string[];
}

export interface HistoryEvent {
  type: InteractionType;
  ageDays: number;
  product: ProductCandidate;
}

export interface RankRequest {
  strategy: 'personalized' | 'baseline';
  profile: EngineProfile | null;
  history: HistoryEvent[];
  candidates: ProductCandidate[];
  limit: number;
  diversify: boolean;
}

export interface CompareRequest {
  strategy: 'personalized' | 'baseline';
  profile: EngineProfile | null;
  history: HistoryEvent[];
  products: ProductCandidate[];
}

export interface IngestionRequest {
  country: string;
  category?: string;
  brand?: string;
  page: number;
  pageSize: number;
}

const criterionScore = z.object({
  criterion: z.enum([
    'nutrition',
    'price',
    'processing',
    'environment',
    'availability',
  ]),
  label: z.string(),
  value: z.number().nullable(),
  weight: z.number(),
  contribution: z.number(),
});

const rankedItem = z.object({
  productId: z.string().nullable(),
  gtin: z.string(),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(100),
  coverage: z.number().min(0).max(1),
  breakdown: z.array(criterionScore),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const rankResponseSchema = z.object({
  engineVersion: z.string(),
  strategy: z.enum(['personalized', 'baseline']),
  weightsUsed: z.record(z.string(), z.number()),
  learnedAdjustments: z.record(z.string(), z.number()),
  items: z.array(rankedItem),
  excluded: z.array(
    z.object({
      productId: z.string().nullable(),
      gtin: z.string(),
      reasons: z.array(z.string()),
    }),
  ),
  stats: z.object({
    candidates: z.number(),
    excluded: z.number(),
    ranked: z.number(),
    tookMs: z.number(),
  }),
});
export type RankResponse = z.infer<typeof rankResponseSchema>;
export type RankedItem = z.infer<typeof rankedItem>;

export const compareResponseSchema = z.object({
  engineVersion: z.string(),
  strategy: z.enum(['personalized', 'baseline']),
  weightsUsed: z.record(z.string(), z.number()),
  items: z.array(
    rankedItem.extend({
      name: z.string(),
      eligible: z.boolean(),
      exclusionReasons: z.array(z.string()),
    }),
  ),
  winnerGtin: z.string().nullable(),
  criteriaWinners: z.record(z.string(), z.array(z.string())),
  summary: z.string(),
});
export type CompareResponse = z.infer<typeof compareResponseSchema>;

const grade = z.enum(['a', 'b', 'c', 'd', 'e']).nullable();

export const normalizedProductSchema = z.object({
  gtin: z.string().regex(/^\d{8,14}$/),
  name: z.string().min(1).max(255),
  brand: z.string().max(120).nullable(),
  categories: z.array(z.string()),
  mainCategory: z.string().max(120).nullable(),
  quantityText: z.string().max(80).nullable(),
  netQuantity: z.number().positive().nullable(),
  unit: z.enum(['g', 'ml']).nullable(),
  isBeverage: z.boolean(),
  imageUrl: z.string().nullable(),
  nutriscoreGrade: grade,
  novaGroup: z.number().int().min(1).max(4).nullable(),
  ecoscoreGrade: grade,
  nutriments: z.record(z.string(), z.number().nullable()),
  highInSeals: z.array(
    z.enum(['calories', 'sugars', 'sodium', 'saturated_fat']),
  ),
  allergens: z.array(z.string()),
  traces: z.array(z.string()),
  labels: z.array(z.string()),
  diets: z.object({
    vegan: z.boolean().nullable(),
    vegetarian: z.boolean().nullable(),
    glutenFree: z.boolean().nullable(),
    lactoseFree: z.boolean().nullable(),
  }),
  stores: z.array(z.string()),
  countries: z.array(z.string()),
  completeness: z.number().min(0).max(1),
  dataQualityScore: z.number().min(0).max(1),
  warnings: z.array(z.string()),
  source: z.object({
    code: z.string(),
    name: z.string(),
    url: z.string(),
    license: z.string(),
    lastModifiedAt: z.string().nullable(),
    fetchedAt: z.string(),
  }),
  rawHash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type NormalizedProduct = z.infer<typeof normalizedProductSchema>;

export const qualityReportSchema = z.object({
  received: z.number(),
  valid: z.number(),
  rejected: z.number(),
  duplicates: z.number(),
  warnings: z.number(),
  validRatio: z.number(),
  duplicateRatio: z.number(),
  fieldCoverage: z.record(z.string(), z.number()),
  rejections: z.array(
    z.object({
      index: z.number(),
      code: z.string().nullable(),
      reason: z.string(),
    }),
  ),
  tookMs: z.number(),
});
export type QualityReport = z.infer<typeof qualityReportSchema>;

export const ingestionResponseSchema = z.object({
  source: z.object({
    code: z.string(),
    name: z.string(),
    apiUrl: z.string(),
    license: z.string(),
    termsUrl: z.string(),
  }),
  fetchedAt: z.string(),
  totalAvailable: z.number(),
  products: z.array(normalizedProductSchema),
  report: qualityReportSchema,
});
export type IngestionResponse = z.infer<typeof ingestionResponseSchema>;

export const readinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['up', 'down', 'skipped'])),
});
export type Readiness = z.infer<typeof readinessSchema>;
