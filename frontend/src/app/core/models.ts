/** Contratos tipados de la API REST de NestJS (ver backend/README.md y /api/docs). */

export type Role = 'admin' | 'operator' | 'user';
export type Grade = 'a' | 'b' | 'c' | 'd' | 'e';
export type Criterion = 'nutrition' | 'price' | 'processing' | 'environment' | 'availability';
export type Diet = 'vegan' | 'vegetarian' | 'gluten_free' | 'lactose_free';
export type HighInSeal = 'calories' | 'sugars' | 'sodium' | 'saturated_fat';
export type InteractionType =
  | 'view'
  | 'favorite'
  | 'unfavorite'
  | 'compare'
  | 'dismiss'
  | 'recommendation_click'
  | 'recommendation_accept'
  | 'recommendation_reject';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: { field?: string; message: string }[];
  requestId: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductPrice {
  amount: number;
  currency: string;
  unitPrice: number | null;
  priceUnit: 'kg' | 'l' | null;
}

export interface ProductSummary {
  id: string;
  gtin: string;
  name: string;
  brand: string | null;
  category: string | null;
  quantityText: string | null;
  imageUrl: string | null;
  nutriscoreGrade: Grade | null;
  novaGroup: number | null;
  ecoscoreGrade: Grade | null;
  highInSeals: HighInSeal[];
  allergens: string[];
  dataQualityScore: number;
  price: ProductPrice | null;
}

export interface Provenance {
  code: string;
  name: string;
  license: string;
  url: string;
  fetchedAt: string;
  sourceLastModifiedAt: string | null;
}

export interface ProductDetail extends ProductSummary {
  categories: string[];
  netQuantity: number | null;
  unit: 'g' | 'ml' | null;
  isBeverage: boolean;
  nutriments: Partial<
    Record<
      'energyKcal' | 'sugars' | 'saturatedFat' | 'sodiumMg' | 'salt' | 'proteins' | 'fiber',
      number | null
    >
  >;
  traces: string[];
  labels: string[];
  diets: {
    vegan?: boolean | null;
    vegetarian?: boolean | null;
    glutenFree?: boolean | null;
    lactoseFree?: boolean | null;
  };
  stores: string[];
  completeness: number;
  provenance: Provenance[];
  priceHistory: {
    amount: number;
    currency: string;
    storeName: string | null;
    observedAt: string;
  }[];
  updatedAt: string;
}

export interface Category {
  slug: string;
  name: string;
  productCount: number;
}

export interface CriterionScore {
  criterion: Criterion;
  label: string;
  value: number | null;
  weight: number;
  contribution: number;
}

export interface ScoredItem {
  productId: string | null;
  gtin: string;
  rank: number;
  score: number;
  coverage: number;
  breakdown: CriterionScore[];
  reasons: string[];
  warnings: string[];
  product: ProductSummary | null;
}

export interface RecommendationResponse {
  strategy: 'personalized' | 'baseline';
  degraded: boolean;
  notice: string | null;
  engineVersion: string | null;
  weightsUsed: Partial<Record<Criterion, number>>;
  learnedAdjustments: Partial<Record<Criterion, number>>;
  excludedCount: number;
  items: ScoredItem[];
  generatedAt: string;
  latencyMs: number;
}

export interface ComparedItem extends ScoredItem {
  name: string;
  eligible: boolean;
  exclusionReasons: string[];
}

export interface ComparisonResponse {
  strategy: 'personalized' | 'baseline';
  degraded: boolean;
  notice: string | null;
  engineVersion: string | null;
  weightsUsed: Partial<Record<Criterion, number>>;
  items: ComparedItem[];
  winnerGtin: string | null;
  criteriaWinners: Partial<Record<Criterion, string[]>>;
  summary: string;
}

export type Weights = Record<Criterion, number>;

export interface Preferences {
  weights: Weights;
  diets: Diet[];
  excludedAllergens: string[];
  avoidHighIn: boolean;
  preferredStores: string[];
  personalizationEnabled: boolean;
  updatedAt?: string;
}

export interface InteractionRecord {
  id: string;
  productId: string;
  type: InteractionType;
  createdAt: string;
}

export interface IngestionRun {
  id: string;
  status: 'running' | 'completed' | 'partial' | 'failed';
  params: Record<string, unknown>;
  counts: {
    fetched: number;
    valid: number;
    inserted: number;
    updated: number;
    unchanged: number;
    duplicates: number;
    rejected: number;
  };
  qualityReport: {
    validRatio?: number;
    duplicateRatio?: number;
    fieldCoverage?: Record<string, number>;
    totalAvailable?: number;
  } | null;
  errorMessage: string | null;
  requestId: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export type CheckStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    api: { status: CheckStatus };
    database: { status: CheckStatus; latencyMs?: number };
    smartmatch: { status: CheckStatus; circuit?: string; detail?: string };
    openfoodfacts: { status: CheckStatus; detail?: string };
  };
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  routes: Record<string, { count: number; errors5xx: number; avgMs: number; p95Ms: number }>;
}
