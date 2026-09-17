import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSkeletonText } from '@ionic/angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CompareStore } from '../../core/compare.store';
import type { ComparedItem, ComparisonResponse, Criterion } from '../../core/models';
import { NetworkService } from '../../core/network.service';
import { GradeBadgeComponent } from '../../shared/components/grade-badge.component';
import { MatchRingComponent } from '../../shared/components/match-ring.component';
import { ProductThumbComponent } from '../../shared/components/product-thumb.component';
import { StatusBannerComponent } from '../../shared/components/status-banner.component';
import { CRITERION_LABELS } from '../../shared/labels';

interface Row {
  criterion: Criterion;
  label: string;
}

/** Pantallas M07 (móvil) y D02 (escritorio): ganador personalizado, ganadores por criterio y explicación. */
@Component({
  selector: 'app-compare-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonSkeletonText,
    RouterLink,
    DecimalPipe,
    GradeBadgeComponent,
    MatchRingComponent,
    ProductThumbComponent,
    StatusBannerComponent,
  ],
  templateUrl: './compare.page.html',
  styleUrl: './compare.page.scss',
})
export class ComparePage {
  protected readonly store = inject(CompareStore);
  protected readonly auth = inject(AuthService);
  protected readonly network = inject(NetworkService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly result = signal<ComparisonResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly rows: Row[] = (
    ['nutrition', 'processing', 'environment', 'price', 'availability'] as Criterion[]
  ).map((criterion) => ({ criterion, label: CRITERION_LABELS[criterion] }));

  protected readonly items = computed<ComparedItem[]>(() => this.result()?.items ?? []);

  constructor() {
    effect(() => {
      const ids = this.store.items().map((p) => p.id);
      if (ids.length >= 2 && this.network.online()) void this.run(ids);
      else this.result.set(null);
    });
  }

  private run(ids: string[]): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    return new Promise((resolve) => {
      this.api.compare(ids).subscribe({
        next: (result) => {
          this.result.set(result);
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

  protected isWinner(item: ComparedItem): boolean {
    return this.result()?.winnerGtin === item.gtin;
  }

  protected valueOf(item: ComparedItem, criterion: Criterion): number | null {
    return item.breakdown.find((b) => b.criterion === criterion)?.value ?? null;
  }

  protected isCriterionWinner(item: ComparedItem, criterion: Criterion): boolean {
    return this.result()?.criteriaWinners[criterion]?.includes(item.gtin) ?? false;
  }

  protected open(item: ComparedItem): void {
    if (item.productId)
      void this.router.navigate(['/app/producto', item.productId], { state: { scored: item } });
  }

  protected remove(productId: string | null): void {
    if (productId) this.store.remove(productId);
  }

  protected retry(): void {
    void this.run(this.store.items().map((p) => p.id));
  }
}
