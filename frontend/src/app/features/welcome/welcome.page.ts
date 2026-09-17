import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { STORAGE_KEYS, StorageService } from '../../core/storage.service';
import { MatchRingComponent } from '../../shared/components/match-ring.component';
import { ProductThumbComponent } from '../../shared/components/product-thumb.component';

/** Pantalla M01 del prototipo: propuesta de valor y acceso como visitante o con cuenta. */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonButton, IonIcon, RouterLink, MatchRingComponent, ProductThumbComponent],
  template: `
    <ion-content [fullscreen]="true" class="welcome">
      <div class="glow g1" aria-hidden="true"></div>
      <div class="glow g2" aria-hidden="true"></div>
      <main class="wrap">
        <div class="brand">
          <span class="logo" aria-hidden="true"><ion-icon name="sparkles-outline"></ion-icon></span>
          <span>SmartCommerce</span>
        </div>

        <section class="preview" aria-label="Ejemplo de recomendación">
          <div class="row">
            <app-product-thumb name="Avena Instantánea" [size]="58" />
            <div class="info">
              <span class="overline">QUAKER</span>
              <strong>Avena Instantánea</strong>
              <small>700 g · Nutri-Score B · NOVA 1</small>
            </div>
            <app-match-ring [score]="92" [size]="54" [dark]="true" />
          </div>
          <ul class="chips">
            <li><ion-icon name="checkmark" aria-hidden="true"></ion-icon> Nutri-Score B</li>
            <li class="lime">
              <ion-icon name="shield-checkmark-outline" aria-hidden="true"></ion-icon> Sin sellos
            </li>
            <li class="violet">
              <ion-icon name="pricetag-outline" aria-hidden="true"></ion-icon> Mejor precio/kg
            </li>
          </ul>
        </section>

        <h1>Compra informado,<br />no solo barato.</h1>
        <p class="lead">
          Comparamos calidad, precio, disponibilidad y tus preferencias para recomendarte lo que de
          verdad te conviene.
        </p>

        <ul class="features">
          <li>
            <span class="f mint"
              ><ion-icon name="shield-checkmark-outline" aria-hidden="true"></ion-icon></span
            >Datos abiertos y verificables
          </li>
          <li>
            <span class="f lime"
              ><ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon></span
            >Recomendaciones que se explican
          </li>
          <li>
            <span class="f violet"
              ><ion-icon name="options-outline" aria-hidden="true"></ion-icon></span
            >Tú controlas la personalización
          </li>
        </ul>

        <div class="actions">
          <ion-button expand="block" class="lime-btn" (click)="go('/auth/registro')"
            >Crear cuenta gratis</ion-button
          >
          <ion-button expand="block" fill="outline" class="ghost-btn" (click)="go('/app/explorar')"
            >Explorar como visitante</ion-button
          >
          <p class="login">
            ¿Ya tienes cuenta? <a routerLink="/auth/login" (click)="markSeen()">Inicia sesión</a>
          </p>
        </div>
      </main>
    </ion-content>
  `,
  styles: `
    .welcome {
      --background: var(--sc-ink);
      --color: #fff;
    }
    .glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(110px);
      pointer-events: none;
    }
    .g1 {
      width: 360px;
      height: 360px;
      top: -80px;
      left: -140px;
      background: rgba(91, 61, 245, 0.6);
    }
    .g2 {
      width: 320px;
      height: 320px;
      top: 45%;
      right: -120px;
      background: rgba(18, 200, 160, 0.3);
    }
    .wrap {
      color: #fff;
      position: relative;
      max-width: 460px;
      margin: 0 auto;
      padding: calc(24px + var(--ion-safe-area-top, 0px)) 28px
        calc(28px + var(--ion-safe-area-bottom, 0px));
      display: grid;
      gap: 22px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 19px;
      font-weight: 800;
    }
    .logo {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--sc-primary), var(--sc-mint));
      font-size: 22px;
    }
    .preview {
      padding: 16px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
      display: grid;
      gap: 14px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .info {
      flex: 1;
      display: grid;
      gap: 2px;
    }
    .overline {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--sc-lavender);
    }
    .info strong {
      font-size: 16px;
    }
    .info small {
      color: var(--sc-lavender);
      font-size: 12px;
    }
    .chips {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chips li {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 11px;
      border-radius: 99px;
      background: rgba(18, 200, 160, 0.18);
      color: #7ef0d2;
      font-size: 12px;
      font-weight: 600;
    }
    .chips li.lime {
      background: rgba(198, 244, 50, 0.16);
      color: var(--sc-lime);
    }
    .chips li.violet {
      background: rgba(139, 92, 246, 0.3);
      color: #dcd0ff;
    }
    h1 {
      font-size: clamp(32px, 9vw, 40px);
      font-weight: 800;
      line-height: 1.08;
    }
    .lead {
      margin: 0;
      color: var(--sc-lavender);
      font-size: 15px;
      line-height: 1.45;
    }
    .features {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
      font-size: 14px;
      font-weight: 600;
    }
    .features li {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .f {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      font-size: 18px;
    }
    .f.mint {
      background: rgba(18, 200, 160, 0.16);
      color: var(--sc-mint);
    }
    .f.lime {
      background: rgba(198, 244, 50, 0.16);
      color: var(--sc-lime);
    }
    .f.violet {
      background: rgba(185, 166, 255, 0.16);
      color: #b9a6ff;
    }
    .actions {
      display: grid;
      gap: 10px;
      margin-top: 6px;
    }
    .lime-btn {
      --background: var(--sc-lime);
      --background-activated: #b5e02d;
      --color: var(--sc-ink);
      --border-radius: 16px;
      min-height: 52px;
      font-size: 15px;
    }
    .ghost-btn {
      --border-color: rgba(255, 255, 255, 0.35);
      --color: #fff;
      --border-radius: 16px;
      min-height: 52px;
      font-size: 15px;
    }
    .login {
      margin: 4px 0 0;
      text-align: center;
      color: var(--sc-lavender);
      font-size: 13px;
    }
    .login a {
      color: var(--sc-lime);
      font-weight: 700;
    }
  `,
})
export class WelcomePage {
  private readonly router = inject(Router);
  private readonly storage = inject(StorageService);

  protected markSeen(): void {
    void this.storage.set(STORAGE_KEYS.welcomeSeen, true);
  }

  protected async go(path: string): Promise<void> {
    await this.storage.set(STORAGE_KEYS.welcomeSeen, true);
    await this.router.navigateByUrl(path);
  }
}
