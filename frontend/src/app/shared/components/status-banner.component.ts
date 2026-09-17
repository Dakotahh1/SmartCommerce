import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';

type Variant = 'offline' | 'degraded' | 'info' | 'success';

const ICONS: Record<Variant, string> = {
  offline: 'cloud-offline-outline',
  degraded: 'alert-circle-outline',
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
};

/** Mensajes de estado del sistema (sin conexión, modo degradado) anunciados a lectores de pantalla. */
@Component({
  selector: 'app-status-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <div class="banner" [class]="'banner ' + variant()" role="status">
      <span class="icon"><ion-icon [name]="icon()" aria-hidden="true"></ion-icon></span>
      <div>
        <strong>{{ title() }}</strong>
        @if (message()) {
          <p>{{ message() }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    .banner {
      display: flex;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      border-radius: 10px;
      background: #fff;
      font-size: 20px;
    }
    strong {
      display: block;
      font-size: 14px;
    }
    p {
      margin: 3px 0 0;
      font-size: 12px;
      line-height: 1.4;
    }
    .offline {
      background: var(--sc-soft-coral);
      border-color: rgba(255, 90, 95, 0.35);
      color: #7a271a;
    }
    .offline .icon,
    .offline strong {
      color: #b42318;
    }
    .degraded {
      background: var(--sc-soft-amber);
      border-color: rgba(255, 176, 32, 0.5);
      color: #6b4600;
    }
    .degraded .icon,
    .degraded strong {
      color: #8a5a00;
    }
    .info {
      background: var(--sc-soft-violet);
      border-color: rgba(91, 61, 245, 0.25);
      color: var(--sc-ink);
    }
    .info .icon {
      color: var(--sc-primary);
    }
    .success {
      background: var(--sc-soft-mint);
      border-color: rgba(18, 200, 160, 0.4);
      color: var(--sc-mint-dark);
    }
  `,
})
export class StatusBannerComponent {
  readonly variant = input<Variant>('info');
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  protected readonly icon = computed(() => ICONS[this.variant()]);
}
