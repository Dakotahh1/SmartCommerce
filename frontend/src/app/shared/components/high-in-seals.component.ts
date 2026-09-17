import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { HighInSeal } from '../../core/models';
import { SEAL_LABELS } from '../labels';

/** Sellos octogonales "ALTO EN" (Ley 20.606), calculados a partir de los nutrientes. */
@Component({
  selector: 'app-high-in-seals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seals">
      @for (seal of seals(); track seal) {
        <svg
          [attr.width]="size()"
          [attr.height]="size()"
          viewBox="0 0 100 100"
          role="img"
          [attr.aria-label]="'Alto en ' + labels[seal]"
        >
          <polygon
            points="29.3,2 70.7,2 98,29.3 98,70.7 70.7,98 29.3,98 2,70.7 2,29.3"
            fill="#111"
            stroke="#fff"
            stroke-width="4"
          />
          <text x="50" y="40" text-anchor="middle" fill="#fff" font-size="17" font-weight="800">
            ALTO EN
          </text>
          <text x="50" y="62" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">
            {{ labels[seal].toUpperCase() }}
          </text>
        </svg>
      }
    </div>
  `,
  styles: `
    .seals {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    text {
      font-family: var(--ion-font-family);
    }
  `,
})
export class HighInSealsComponent {
  readonly seals = input<HighInSeal[]>([]);
  readonly size = input(54);
  protected readonly labels = SEAL_LABELS;
}
