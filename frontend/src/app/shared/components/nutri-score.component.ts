import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Grade } from '../../core/models';

/** Escala oficial Nutri-Score A–E con la letra del producto destacada. */
@Component({
  selector: 'app-nutri-score',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="scale"
      role="img"
      [attr.aria-label]="
        grade() ? 'Nutri-Score ' + grade()!.toUpperCase() : 'Nutri-Score no disponible'
      "
    >
      @for (letter of letters; track letter) {
        <span
          class="cell"
          [class]="'cell g-' + letter"
          [class.active]="letter === grade()"
          aria-hidden="true"
        >
          {{ letter.toUpperCase() }}
        </span>
      }
    </div>
  `,
  styles: `
    .scale {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .cell {
      display: grid;
      place-items: center;
      width: 16px;
      height: 20px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 800;
      color: #fff;
      opacity: 0.5;
    }
    .cell.active {
      width: 24px;
      height: 28px;
      border-radius: 7px;
      font-size: 15px;
      opacity: 1;
      border: 2px solid #fff;
      box-shadow: 0 3px 8px rgba(14, 16, 32, 0.25);
    }
    .g-a {
      background: var(--sc-grade-a);
    }
    .g-b {
      background: var(--sc-grade-b);
    }
    .g-c {
      background: var(--sc-grade-c);
      color: var(--sc-ink);
    }
    .g-d {
      background: var(--sc-grade-d);
    }
    .g-e {
      background: var(--sc-grade-e);
    }
  `,
})
export class NutriScoreComponent {
  readonly grade = input<Grade | null>(null);
  protected readonly letters: Grade[] = ['a', 'b', 'c', 'd', 'e'];
}
