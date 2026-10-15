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
  /** Puntaje de relevancia (ts_rank_cd) cuando la búsqueda se ordena por relevancia. */
  relevance?: number;
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

export interface IngestionTarget {
  country: string;
  category: string;
}

export interface ScheduledBatch {
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  reason?: string;
  requestId: string;
  startedAt: string;
  finishedAt: string;
  targets: (IngestionTarget & {
    pages: number;
    fetched: number;
    inserted: number;
    updated: number;
    unchanged: number;
    rejected: number;
    error: string | null;
  })[];
}

export interface IngestionSchedule {
  enabled: boolean;
  running: boolean;
  intervalMinutes: number;
  maxPages: number;
  pageSize: number;
  targets: IngestionTarget[];
  nextRunAt: string | null;
  lastBatch: ScheduledBatch | null;
}

export interface QualityAlert {
  code: string;
  message: string;
}

export interface DataQualityReport {
  generatedAt: string;
  windowDays: number;
  thresholds: {
    minValidRatio: number;
    maxDuplicateRatio: number;
    maxStaleRatio: number;
    maxErrorRate: number;
  };
  catalog: {
    products: number;
    indexedRatio: number | null;
    avgDataQualityScore: number | null;
    fieldCoverage: Record<string, number | null>;
  };
  validity: {
    fetched: number;
    valid: number;
    rejected: number;
    duplicates: number;
    validRatio: number | null;
    duplicateRatio: number | null;
    topRejectionReasons: { reason: string; count: number }[];
  };
  freshness: {
    staleAfterDays: number;
    tracked: number;
    stale: number;
    staleRatio: number | null;
    oldestFetchAt: string | null;
    newestFetchAt: string | null;
    medianAgeHours: number | null;
    medianSourceAgeDays: number | null;
  };
  sourceCoverage: {
    category: string;
    totalAvailable: number | null;
    stored: number;
    coverageRatio: number | null;
    lastRunAt: string;
  }[];
  reliability: {
    runs: number;
    failed: number;
    scheduled: number;
    errorRate: number | null;
    avgDurationMs: number | null;
    p95DurationMs: number | null;
    lastSuccessAt: string | null;
    recentFailures: { id: string; error: string | null; trigger: string; startedAt: string }[];
    changes: { inserted: number; updated: number; unchanged: number };
  };
  source: {
    requests: number;
    errors: number;
    errorRate: number;
    avgMs: number;
    p95Ms: number;
    lastError?: { outcome: string; detail: string | null; at: string } | null;
  } | null;
  alerts: QualityAlert[];
}
