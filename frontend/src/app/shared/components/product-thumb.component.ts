import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

const PALETTES = [
  ['#12c8a0', '#5b3df5'],
  ['#8b5cf6', '#3a22c9'],
  ['#ffb020', '#ee8100'],
  ['#ff5a5f', '#8b5cf6'],
  ['#3fb8ff', '#5b3df5'],
];

/** Imagen del producto (Open Food Facts, CC BY-SA) o placeholder con degradado de marca. */
@Component({
  selector: 'app-product-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="thumb"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="background()"
    >
      @if (imageUrl() && !failed()) {
        <img
          [src]="imageUrl()"
          [alt]="'Foto de ' + name()"
          loading="lazy"
          referrerpolicy="no-referrer"
          (error)="failed.set(true)"
        />
      } @else {
        <svg viewBox="0 0 100 100" aria-hidden="true" [style.width.%]="70" [style.height.%]="70">
          <rect x="28" y="16" width="44" height="68" rx="5" fill="#fff" />
          <rect
            x="35"
            y="28"
            width="30"
            height="20"
            rx="4"
            [attr.fill]="palette()[1]"
            fill-opacity=".35"
          />
          <rect
            x="35"
            y="56"
            width="22"
            height="4"
            rx="2"
            [attr.fill]="palette()[1]"
            fill-opacity=".45"
          />
          <rect
            x="35"
            y="64"
            width="16"
            height="4"
            rx="2"
            [attr.fill]="palette()[1]"
            fill-opacity=".3"
          />
        </svg>
        <span class="visually-hidden">Sin imagen de {{ name() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    .thumb {
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 28%;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #fff;
      padding: 8%;
    }
  `,
})
export class ProductThumbComponent {
  readonly name = input.required<string>();
  readonly imageUrl = input<string | null>(null);
  readonly size = input(64);
  protected readonly failed = signal(false);

  protected readonly palette = computed(() => {
    const hash = [...this.name()].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return PALETTES[hash % PALETTES.length];
  });
  protected readonly background = computed(() =>
    this.imageUrl() && !this.failed()
      ? '#ffffff'
      : `linear-gradient(135deg, ${this.palette()[0]}, ${this.palette()[1]})`,
  );
}
