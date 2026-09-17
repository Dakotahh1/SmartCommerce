import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import type { ProductSummary, ScoredItem } from '../../core/models';
import { formatPrice } from '../labels';
import { GradeBadgeComponent } from './grade-badge.component';
import { MatchRingComponent } from './match-ring.component';
import { ProductThumbComponent } from './product-thumb.component';

/** Tarjeta de producto recomendado: puntaje, insignias, razones ("por qué") y acciones de control. */
@Component({
  selector: 'app-product-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonIcon, GradeBadgeComponent, MatchRingComponent, ProductThumbComponent],
  template: `
    <article class="card" [attr.aria-label]="product().name">
      <div class="top">
        <app-product-thumb [name]="product().name" [imageUrl]="product().imageUrl" [size]="76" />
        <div class="info">
          @if (product().brand) {
            <span class="sc-overline">{{ product().brand }}</span>
          }
          <h3>{{ product().name }}</h3>
          <p class="meta">{{ meta() }}</p>
          <div class="badges">
            <app-grade-badge label="Nutri" [value]="product().nutriscoreGrade" />
            <app-grade-badge label="NOVA" [value]="product().novaGroup" kind="nova" />
            <app-grade-badge label="Eco" [value]="product().ecoscoreGrade" />
          </div>
        </div>
        @if (scored(); as item) {
          <div class="ring">
            <app-match-ring [score]="item.score" />
            <span>match</span>
          </div>
        }
      </div>

      @if (scored(); as item) {
        @if (item.reasons.length || item.warnings.length) {
          <div class="why">
            <span class="why-title"
              ><ion-icon name="information-circle-outline" aria-hidden="true"></ion-icon> Por qué te
              lo recomendamos</span
            >
            <ul class="sc-chip-row">
              @for (reason of item.reasons; track reason) {
                <li class="chip ok">
                  <ion-icon name="checkmark" aria-hidden="true"></ion-icon>{{ reason }}
                </li>
              }
              @for (warning of item.warnings.slice(0, 2); track warning) {
                <li class="chip warn">
                  <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>{{ warning }}
                </li>
              }
            </ul>
          </div>
        }
      }

      <div class="actions">
        @if (dismissible()) {
          <ion-button
            fill="clear"
            color="medium"
            class="icon-btn"
            (click)="dismiss.emit(product())"
            aria-label="No me interesa"
          >
            <ion-icon slot="icon-only" name="thumbs-down-outline"></ion-icon>
          </ion-button>
        }
        <ion-button
          fill="solid"
          color="light"
          class="grow compare"
          (click)="compare.emit(product())"
        >
          <ion-icon slot="start" name="swap-horizontal-outline" aria-hidden="true"></ion-icon>
          Comparar
        </ion-button>
        <ion-button class="grow sc-primary small" (click)="open.emit(product())">
          Ver detalle
          <ion-icon slot="end" name="chevron-forward" aria-hidden="true"></ion-icon>
        </ion-button>
      </div>
    </article>
  `,
  styles: `
    .card {
      background: var(--sc-white);
      border-radius: var(--sc-radius-card);
      box-shadow: var(--sc-shadow-card);
      padding: 14px;
      display: grid;
      gap: 12px;
      height: 100%;
    }
    .top {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .info {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 3px;
    }
    h3 {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .meta {
      margin: 0;
      font-size: 12px;
      color: var(--sc-slate);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }
    .ring {
      display: grid;
      justify-items: center;
      gap: 2px;
      font-size: 10px;
      font-weight: 600;
      color: var(--sc-muted);
    }
    .why {
      background: var(--sc-bg);
      border-radius: 14px;
      padding: 10px 12px;
      display: grid;
      gap: 8px;
    }
    .why-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--sc-primary);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .chip.ok {
      background: var(--sc-soft-mint);
      color: var(--sc-mint-dark);
    }
    .chip.warn {
      background: var(--sc-soft-amber);
      color: #6b4600;
    }
    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
      align-self: end;
    }
    .grow {
      flex: 1;
    }
    ion-button {
      --border-radius: 12px;
      margin: 0;
      min-height: var(--sc-touch-target);
      font-size: 13px;
    }
    ion-button.small {
      min-height: var(--sc-touch-target);
    }
    .compare {
      --color: var(--sc-primary);
      --background: var(--sc-soft-violet);
    }
    .icon-btn {
      --padding-start: 10px;
      --padding-end: 10px;
      --background: var(--sc-bg);
    }
  `,
})
export class ProductCardComponent {
  readonly product = input.required<ProductSummary>();
  readonly scored = input<ScoredItem | null>(null);
  readonly dismissible = input(false);

  readonly open = output<ProductSummary>();
  readonly compare = output<ProductSummary>();
  readonly dismiss = output<ProductSummary>();

  protected readonly meta = computed(() => {
    const p = this.product();
    const parts = [p.quantityText];
    if (p.price) {
      parts.push(formatPrice(p.price.amount, p.price.currency));
      if (p.price.unitPrice)
        parts.push(`${formatPrice(p.price.unitPrice, p.price.currency)}/${p.price.priceUnit}`);
    }
    return parts.filter(Boolean).join(' · ') || 'Cantidad no informada';
  });
}
