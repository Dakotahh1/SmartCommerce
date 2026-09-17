import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let ringCounter = 0;

/** Porcentaje de coincidencia SmartMatch (0–100) como anillo con degradado menta → primario. */
@Component({
  selector: 'app-match-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 100 100"
      role="img"
      [attr.aria-label]="'Coincidencia ' + rounded() + ' por ciento'"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" [attr.stop-color]="low() ? '#ffb020' : '#12c8a0'" />
          <stop offset="100%" [attr.stop-color]="low() ? '#ee8100' : '#5b3df5'" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="42" fill="none" [attr.stroke]="track()" stroke-width="10" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        [attr.stroke]="'url(#' + gradientId + ')'"
        stroke-width="10"
        stroke-linecap="round"
        [attr.stroke-dasharray]="dash()"
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="50"
        text-anchor="middle"
        dominant-baseline="central"
        class="value"
        [attr.fill]="textColor()"
      >
        {{ rounded() }}%
      </text>
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    .value {
      font-size: 26px;
      font-weight: 800;
      font-family: var(--ion-font-family);
    }
  `,
})
export class MatchRingComponent {
  readonly score = input.required<number>();
  readonly size = input(56);
  readonly dark = input(false);

  protected readonly gradientId = `sc-ring-${++ringCounter}`;
  protected readonly rounded = computed(() => Math.round(Math.min(100, Math.max(0, this.score()))));
  protected readonly low = computed(() => this.rounded() < 60);
  protected readonly dash = computed(() => {
    const circumference = 2 * Math.PI * 42;
    return `${(circumference * this.rounded()) / 100} ${circumference}`;
  });
  protected readonly track = computed(() => (this.dark() ? 'rgba(255,255,255,0.18)' : '#eeeafe'));
  protected readonly textColor = computed(() => (this.dark() ? '#ffffff' : '#0e1020'));
}
