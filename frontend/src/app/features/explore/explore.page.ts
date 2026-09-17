import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSearchbar,
  IonSkeletonText,
} from '@ionic/angular';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService, type ProductQuery } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CompareStore } from '../../core/compare.store';
import type { Category, ProductSummary } from '../../core/models';
import { NotifierService } from '../../core/notifier.service';
import { GradeBadgeComponent } from '../../shared/components/grade-badge.component';
import { ProductThumbComponent } from '../../shared/components/product-thumb.component';
import { StatusBannerComponent } from '../../shared/components/status-banner.component';
import { SEAL_LABELS } from '../../shared/labels';

interface Filters {
  goodNutrition: boolean;
  lowProcessing: boolean;
  glutenFree: boolean;
  category: string | null;
}

/** Pantalla M05 del prototipo: búsqueda y filtros del catálogo normalizado (público). */
@Component({
  selector: 'app-explore-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonSearchbar,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonSkeletonText,
    ReactiveFormsModule,
    GradeBadgeComponent,
    ProductThumbComponent,
    StatusBannerComponent,
  ],
  templateUrl: './explore.page.html',
  styleUrl: './explore.page.scss',
})
export class ExplorePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly compare = inject(CompareStore);
  private readonly notifier = inject(NotifierService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly products = signal<ProductSummary[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly filters = signal<Filters>({
    goodNutrition: false,
    lowProcessing: false,
    glutenFree: false,
    category: null,
  });
  protected readonly sealLabels = SEAL_LABELS;
  private page = 1;
  private totalPages = 1;

  ngOnInit(): void {
    this.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.reload());
    this.api.getCategories().subscribe({
      next: (categories) =>
        this.categories.set(categories.filter((c) => c.productCount > 0).slice(0, 12)),
      error: () => undefined,
    });
    void this.reload();
  }

  protected toggle(key: 'goodNutrition' | 'lowProcessing' | 'glutenFree'): void {
    this.filters.update((f) => ({ ...f, [key]: !f[key] }));
    void this.reload();
  }

  protected selectCategory(slug: string | null): void {
    this.filters.update((f) => ({ ...f, category: f.category === slug ? null : slug }));
    void this.reload();
  }

  async reload(): Promise<void> {
    this.page = 1;
    this.loading.set(true);
    await this.fetch(false);
  }

  async loadMore(event: CustomEvent): Promise<void> {
    if (this.page < this.totalPages) {
      this.page += 1;
      await this.fetch(true);
    }
    const target = event.target as HTMLIonInfiniteScrollElement;
    await target.complete();
    target.disabled = this.page >= this.totalPages;
  }

  private query(): ProductQuery {
    const f = this.filters();
    return {
      q: this.search.value.trim() || undefined,
      category: f.category ?? undefined,
      nutriscore: f.goodNutrition ? ['a', 'b'] : undefined,
      maxNova: f.lowProcessing ? 2 : undefined,
      excludeAllergens: f.glutenFree ? ['gluten'] : undefined,
      page: this.page,
      limit: 20,
    };
  }

  private fetch(append: boolean): Promise<void> {
    return new Promise((resolve) => {
      this.api.searchProducts(this.query()).subscribe({
        next: (page) => {
          this.products.update((current) => (append ? [...current, ...page.items] : page.items));
          this.total.set(page.total);
          this.totalPages = page.totalPages;
          this.failed.set(false);
          this.loading.set(false);
          resolve();
        },
        error: () => {
          this.failed.set(true);
          this.loading.set(false);
          resolve();
        },
      });
    });
  }

  protected open(product: ProductSummary): void {
    void this.router.navigate(['/app/producto', product.id]);
  }

  protected addToCompare(product: ProductSummary, event: Event): void {
    event.stopPropagation();
    const result = this.compare.add(product);
    if (result === 'added') {
      this.notifier.success(`${product.name} agregado a la comparación`);
      if (this.auth.isAuthenticated())
        this.api
          .recordInteraction(product.id, 'compare', 'explore')
          .subscribe({ error: () => undefined });
    } else {
      this.notifier.warning(
        result === 'full' ? 'Puedes comparar hasta 4 productos.' : 'Ya está en tu comparación.',
      );
    }
  }

  protected inCompare(id: string): boolean {
    return this.compare.has(id);
  }
}
