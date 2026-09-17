import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  ViewWillEnter,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CompareStore } from '../../core/compare.store';
import type { ProductSummary, RecommendationResponse, ScoredItem } from '../../core/models';
import { NetworkService } from '../../core/network.service';
import { NotifierService } from '../../core/notifier.service';
import { STORAGE_KEYS, StorageService } from '../../core/storage.service';
import { ProductCardComponent } from '../../shared/components/product-card.component';
import { StatusBannerComponent } from '../../shared/components/status-banner.component';

interface CachedRecommendations {
  data: RecommendationResponse;
  savedAt: string;
}

/** Pantallas M04 (móvil) y D01 (escritorio): recomendaciones SmartMatch explicables. */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    IonSkeletonText,
    RouterLink,
    ProductCardComponent,
    StatusBannerComponent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly compare = inject(CompareStore);
  private readonly notifier = inject(NotifierService);
  private readonly storage = inject(StorageService);
  protected readonly network = inject(NetworkService);

  protected readonly loading = signal(true);
  protected readonly recommendations = signal<RecommendationResponse | null>(null);
  protected readonly topProducts = signal<ProductSummary[]>([]);
  protected readonly cachedAt = signal<string | null>(null);
  protected readonly failed = signal(false);

  protected readonly items = computed<ScoredItem[]>(() =>
    (this.recommendations()?.items ?? []).filter((item) => item.product !== null),
  );
  protected readonly learnedSummary = computed(() => {
    const adjustments = this.recommendations()?.learnedAdjustments ?? {};
    const labels: Record<string, string> = {
      nutrition: 'nutrición',
      price: 'precio',
      processing: 'procesamiento',
      environment: 'impacto ambiental',
      availability: 'disponibilidad',
    };
    const top = Object.entries(adjustments)
      .filter(([, delta]) => Math.abs(delta ?? 0) >= 1)
      .sort(([, a], [, b]) => Math.abs(b ?? 0) - Math.abs(a ?? 0))
      .slice(0, 2)
      .map(
        ([criterion, delta]) =>
          `${labels[criterion]} ${delta! > 0 ? '+' : ''}${Math.round(delta!)}`,
      );
    return top.length
      ? `Ajustes aprendidos: ${top.join(', ')}`
      : 'Aún no hay ajustes aprendidos: interactúa con productos';
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(event?: CustomEvent): Promise<void> {
    this.failed.set(false);
    if (!this.recommendations() && !this.topProducts().length) this.loading.set(true);
    try {
      if (this.auth.isAuthenticated()) {
        const data = await firstValueFrom(this.api.getRecommendations(10));
        this.recommendations.set(data);
        this.cachedAt.set(null);
        void this.storage.set(STORAGE_KEYS.recommendations, {
          data,
          savedAt: new Date().toISOString(),
        } satisfies CachedRecommendations);
      } else {
        const page = await firstValueFrom(this.api.searchProducts({ sort: 'quality', limit: 6 }));
        this.topProducts.set(page.items);
      }
    } catch {
      const cached = await this.storage.get<CachedRecommendations>(STORAGE_KEYS.recommendations);
      if (cached && this.auth.isAuthenticated()) {
        this.recommendations.set(cached.data);
        this.cachedAt.set(cached.savedAt);
      } else {
        this.failed.set(true);
      }
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  protected open(product: ProductSummary, item?: ScoredItem): void {
    if (item && this.auth.isAuthenticated()) {
      this.api
        .recordInteraction(product.id, 'recommendation_click', 'home')
        .subscribe({ error: () => undefined });
    }
    void this.router.navigate(['/app/producto', product.id], { state: { scored: item ?? null } });
  }

  protected addToCompare(product: ProductSummary): void {
    const result = this.compare.add(product);
    if (result === 'full') this.notifier.warning('Puedes comparar hasta 4 productos.');
    else if (result === 'exists') this.notifier.warning('Ese producto ya está en tu comparación.');
    else {
      this.notifier.success(`${product.name} agregado a la comparación`);
      if (this.auth.isAuthenticated())
        this.api
          .recordInteraction(product.id, 'compare', 'home')
          .subscribe({ error: () => undefined });
    }
  }

  /** Control del usuario: descartar una recomendación es una señal negativa para el aprendizaje. */
  protected dismiss(product: ProductSummary): void {
    this.recommendations.update((current) =>
      current
        ? { ...current, items: current.items.filter((i) => i.productId !== product.id) }
        : current,
    );
    this.api.recordInteraction(product.id, 'recommendation_reject', 'home').subscribe({
      next: () =>
        this.notifier.success('Gracias: tendremos esto en cuenta en tus próximas recomendaciones'),
      error: () => undefined,
    });
  }

  protected greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }
}
