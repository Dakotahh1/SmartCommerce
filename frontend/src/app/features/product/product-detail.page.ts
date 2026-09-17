import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSkeletonText, NavController } from '@ionic/angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CompareStore } from '../../core/compare.store';
import type { ProductDetail, ScoredItem } from '../../core/models';
import { NotifierService } from '../../core/notifier.service';
import { HighInSealsComponent } from '../../shared/components/high-in-seals.component';
import { MatchRingComponent } from '../../shared/components/match-ring.component';
import { NutriScoreComponent } from '../../shared/components/nutri-score.component';
import { ProductThumbComponent } from '../../shared/components/product-thumb.component';
import { ScoreBreakdownComponent } from '../../shared/components/score-breakdown.component';
import { StatusBannerComponent } from '../../shared/components/status-banner.component';
import { ALLERGEN_LABELS, DIET_LABELS, formatPrice, NOVA_LABELS } from '../../shared/labels';

/** Pantalla M06 del prototipo: calidad del producto, explicación del puntaje y procedencia de los datos. */
@Component({
  selector: 'app-product-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonSkeletonText,
    DatePipe,
    DecimalPipe,
    HighInSealsComponent,
    MatchRingComponent,
    NutriScoreComponent,
    ProductThumbComponent,
    ScoreBreakdownComponent,
    StatusBannerComponent,
  ],
  templateUrl: './product-detail.page.html',
  styleUrl: './product-detail.page.scss',
})
export class ProductDetailPage implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly compare = inject(CompareStore);
  private readonly notifier = inject(NotifierService);
  private readonly router = inject(Router);
  protected readonly nav = inject(NavController);

  protected readonly product = signal<ProductDetail | null>(null);
  protected readonly failed = signal(false);
  protected readonly favorite = signal(false);
  protected readonly scored = signal<ScoredItem | null>(
    ((this.router.currentNavigation()?.extras.state?.['scored'] ??
      (globalThis.history?.state as Record<string, unknown> | undefined)?.['scored']) as
      ScoredItem | null | undefined) ?? null,
  );
  protected readonly novaLabels = NOVA_LABELS;
  protected readonly allergenLabels = ALLERGEN_LABELS;

  protected readonly diets = computed(() => {
    const diets = this.product()?.diets ?? {};
    return (
      [
        ['glutenFree', DIET_LABELS.gluten_free],
        ['lactoseFree', DIET_LABELS.lactose_free],
        ['vegan', DIET_LABELS.vegan],
        ['vegetarian', DIET_LABELS.vegetarian],
      ] as const
    ).map(([key, label]) => ({ label, value: diets[key] ?? null }));
  });

  protected readonly nutrients = computed(() => {
    const n = this.product()?.nutriments ?? {};
    const per = this.product()?.isBeverage ? '100 ml' : '100 g';
    return [
      { label: `Energía (${per})`, value: n.energyKcal, unit: 'kcal' },
      { label: 'Azúcares', value: n.sugars, unit: 'g' },
      { label: 'Grasas saturadas', value: n.saturatedFat, unit: 'g' },
      { label: 'Sodio', value: n.sodiumMg, unit: 'mg' },
      { label: 'Proteínas', value: n.proteins, unit: 'g' },
      { label: 'Fibra', value: n.fiber, unit: 'g' },
    ];
  });

  protected readonly priceText = computed(() => {
    const price = this.product()?.price;
    if (!price) return 'Precio no disponible en la fuente';
    const unit = price.unitPrice
      ? ` · ${formatPrice(price.unitPrice, price.currency)}/${price.priceUnit}`
      : '';
    return `${formatPrice(price.amount, price.currency)}${unit}`;
  });

  ngOnInit(): void {
    this.api.getProduct(this.id()).subscribe({
      next: (product) => {
        this.product.set(product);
        if (this.auth.isAuthenticated()) {
          this.api
            .recordInteraction(product.id, 'view', 'detail')
            .subscribe({ error: () => undefined });
        }
      },
      error: () => this.failed.set(true),
    });
  }

  protected toggleFavorite(): void {
    const product = this.product();
    if (!product) return;
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/app/producto/${product.id}` },
      });
      return;
    }
    const next = !this.favorite();
    this.favorite.set(next);
    this.api.recordInteraction(product.id, next ? 'favorite' : 'unfavorite', 'detail').subscribe({
      next: () => this.notifier.success(next ? 'Agregado a favoritos' : 'Quitado de favoritos'),
      error: () => this.favorite.set(!next),
    });
  }

  protected addToCompare(): void {
    const product = this.product();
    if (!product) return;
    const result = this.compare.add(product);
    if (result === 'added') {
      this.notifier.success('Agregado a la comparación');
      if (this.auth.isAuthenticated())
        this.api
          .recordInteraction(product.id, 'compare', 'detail')
          .subscribe({ error: () => undefined });
      void this.router.navigateByUrl('/app/comparar');
    } else {
      void this.router.navigateByUrl('/app/comparar');
    }
  }
}
