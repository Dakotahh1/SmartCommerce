import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SILENT_ERRORS } from './http-context';
import type {
  Category,
  ComparisonResponse,
  HealthReport,
  IngestionRun,
  InteractionRecord,
  InteractionType,
  MetricsSnapshot,
  Page,
  Preferences,
  ProductDetail,
  ProductSummary,
  RecommendationResponse,
  UserProfile,
} from './models';

export interface ProductQuery {
  q?: string;
  category?: string;
  nutriscore?: string[];
  maxNova?: number;
  excludeAllergens?: string[];
  sort?: 'quality' | 'name' | 'recent';
  page?: number;
  limit?: number;
}

/** Acceso a la API REST de NestJS (única puerta de entrada al backend). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/v1`;

  // ── Catálogo (público) ──────────────────────────────────────────────────
  searchProducts(query: ProductQuery): Observable<Page<ProductSummary>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length) params = params.set(key, value.join(','));
      } else {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<Page<ProductSummary>>(`${this.base}/products`, { params });
  }

  getProduct(id: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.base}/products/${encodeURIComponent(id)}`);
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base}/categories`);
  }

  // ── SmartMatch ──────────────────────────────────────────────────────────
  getRecommendations(limit = 10, category?: string): Observable<RecommendationResponse> {
    let params = new HttpParams().set('limit', limit);
    if (category) params = params.set('category', category);
    return this.http.get<RecommendationResponse>(`${this.base}/recommendations`, { params });
  }

  compare(productIds: string[]): Observable<ComparisonResponse> {
    return this.http.post<ComparisonResponse>(`${this.base}/comparisons`, { productIds });
  }

  // ── Cuenta ──────────────────────────────────────────────────────────────
  me(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}/auth/me`);
  }

  getPreferences(): Observable<Preferences> {
    return this.http.get<Preferences>(`${this.base}/me/preferences`);
  }

  updatePreferences(preferences: Preferences): Observable<Preferences> {
    const { updatedAt: _ignored, ...body } = preferences;
    return this.http.put<Preferences>(`${this.base}/me/preferences`, body);
  }

  recordInteraction(
    productId: string,
    type: InteractionType,
    screen?: string,
  ): Observable<InteractionRecord> {
    return this.http.post<InteractionRecord>(
      `${this.base}/interactions`,
      { productId, type, ...(screen ? { context: { screen } } : {}) },
      { context: new HttpContext().set(SILENT_ERRORS, true) },
    );
  }

  getInteractions(): Observable<InteractionRecord[]> {
    return this.http.get<InteractionRecord[]>(`${this.base}/me/interactions`);
  }

  resetLearning(): Observable<void> {
    return this.http.delete<void>(`${this.base}/me/interactions`);
  }

  getFavorites(): Observable<ProductSummary[]> {
    return this.http.get<ProductSummary[]>(`${this.base}/me/favorites`);
  }

  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/auth/me`, {
      body: { password },
      context: new HttpContext().set(SILENT_ERRORS, true),
    });
  }

  // ── Administración ──────────────────────────────────────────────────────
  startIngestion(body: {
    country: string;
    category?: string;
    pageSize: number;
    page?: number;
  }): Observable<IngestionRun> {
    return this.http.post<IngestionRun>(`${this.base}/admin/ingestions`, body, {
      context: new HttpContext().set(SILENT_ERRORS, true),
    });
  }

  listIngestions(page = 1, limit = 20): Observable<Page<IngestionRun>> {
    return this.http.get<Page<IngestionRun>>(`${this.base}/admin/ingestions`, {
      params: new HttpParams().set('page', page).set('limit', limit),
    });
  }

  // ── Salud ───────────────────────────────────────────────────────────────
  health(): Observable<HealthReport> {
    return this.http.get<HealthReport>(`${environment.apiUrl}/health`, {
      context: new HttpContext().set(SILENT_ERRORS, true),
    });
  }

  metrics(): Observable<MetricsSnapshot> {
    return this.http.get<MetricsSnapshot>(`${environment.apiUrl}/health/metrics`);
  }
}
