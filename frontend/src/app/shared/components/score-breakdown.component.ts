import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CriterionScore } from '../../core/models';
import { CRITERION_COLORS } from '../labels';

/** Explicación del puntaje: valor de cada criterio (0–100) y su peso en el cálculo. */
@Component({
  selector: 'app-score-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="bars">
      @for (item of breakdown(); track item.criterion) {
        <li [class.missing]="item.value === null">
          <div class="row">
            <span class="label"
              >{{ item.label }} · peso {{ item.weight * 100 | number: '1.0-0' }}%</span
            >
            <span class="value">{{
              item.value === null ? 'sin dato' : (item.value * 100 | number: '1.0-0') + '/100'
            }}</span>
          </div>
          <div
            class="track"
            role="progressbar"
            [attr.aria-label]="item.label"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="item.value === null ? null : item.value * 100"
          >
            <div
              class="fill"
              [style.width.%]="(item.value ?? 0) * 100"
              [style.background]="colors[item.criterion]"
            ></div>
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    .bars {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 5px;
      font-size: 12px;
    }
    .label {
      font-weight: 500;
    }
    .value {
      font-weight: 700;
    }
    .track {
      height: 6px;
      border-radius: 99px;
      background: var(--sc-line);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: 99px;
      transition: width 400ms ease;
    }
    .missing .value {
      color: var(--sc-muted);
      font-weight: 600;
    }
  `,
  imports: [DecimalPipe],
})
export class ScoreBreakdownComponent {
  readonly breakdown = input<CriterionScore[]>([]);
  protected readonly colors = CRITERION_COLORS;
}
