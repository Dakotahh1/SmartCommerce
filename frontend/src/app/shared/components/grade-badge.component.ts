import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const GRADE_COLORS: Record<string, string> = {
  a: 'var(--sc-grade-a)',
  b: 'var(--sc-grade-b)',
  c: 'var(--sc-grade-c)',
  d: 'var(--sc-grade-d)',
  e: 'var(--sc-grade-e)',
};
const NOVA_COLORS: Record<string, string> = {
  '1': 'var(--sc-grade-a)',
  '2': 'var(--sc-grade-b)',
  '3': 'var(--sc-grade-d)',
  '4': 'var(--sc-grade-e)',
};

/** Insignia compacta: "Nutri B", "NOVA 1", "Eco C". Gris con "?" cuando el dato no existe. */
@Component({
  selector: 'app-grade-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [attr.aria-label]="ariaLabel()">
      <span class="label" aria-hidden="true">{{ label() }}</span>
      <span
        class="value"
        aria-hidden="true"
        [style.background]="color()"
        [class.dark]="darkText()"
        >{{ display() }}</span
      >
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 3px 3px 7px;
      border: 1px solid var(--sc-line);
      border-radius: 8px;
      background: var(--sc-white);
    }
    .label {
      font-size: 10px;
      font-weight: 600;
      color: var(--sc-slate);
    }
    .value {
      min-width: 20px;
      padding: 1px 6px;
      border-radius: 6px;
      text-align: center;
      font-size: 11px;
      font-weight: 800;
      color: #fff;
    }
    .value.dark {
      color: var(--sc-ink);
    }
  `,
})
export class GradeBadgeComponent {
  readonly label = input.required<string>();
  readonly value = input<string | number | null>(null);
  readonly kind = input<'grade' | 'nova'>('grade');

  protected readonly display = computed(() => {
    const value = this.value();
    return value === null || value === undefined ? '?' : String(value).toUpperCase();
  });
  protected readonly color = computed(() => {
    const value = String(this.value() ?? '').toLowerCase();
    const palette = this.kind() === 'nova' ? NOVA_COLORS : GRADE_COLORS;
    return palette[value] ?? '#b9b4d6';
  });
  protected readonly darkText = computed(() => String(this.value()).toLowerCase() === 'c');
  protected readonly ariaLabel = computed(() =>
    this.value() === null ? `${this.label()}: sin dato` : `${this.label()}: ${this.display()}`,
  );
}
