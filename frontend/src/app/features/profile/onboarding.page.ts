import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { Preferences } from '../../core/models';
import { NotifierService } from '../../core/notifier.service';
import { DEFAULT_PREFERENCES, PreferencesFormComponent } from './preferences-form.component';

@Component({
  selector: 'app-onboarding-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonButton, IonIcon, IonSpinner, PreferencesFormComponent],
  template: `
    <ion-content [fullscreen]="true">
      <main class="sc-page onboarding">
        <div class="steps" aria-label="Paso 2 de 3">
          <span class="on"></span><span class="on"></span><span></span>
          <button type="button" class="skip" (click)="skip()">Saltar</button>
        </div>
        <h1>¿Qué es importante para ti?</h1>
        <p class="sc-muted">
          SmartMatch usa estos pesos para ordenar tus recomendaciones. Cámbialos cuando quieras.
        </p>

        <app-preferences-form [value]="defaults" (save)="persist($event)" #prefs>
          <ion-button type="submit" expand="block" class="sc-primary" [disabled]="saving()">
            @if (saving()) {
              <ion-spinner name="crescent" aria-label="Guardando"></ion-spinner>
            } @else {
              <ion-icon slot="start" name="sparkles-outline" aria-hidden="true"></ion-icon>
              Guardar y ver recomendaciones
            }
          </ion-button>
        </app-preferences-form>
      </main>
    </ion-content>
  `,
  styles: `
    .onboarding {
      max-width: 560px;
      padding-top: calc(20px + var(--ion-safe-area-top, 0px));
      display: grid;
      gap: 10px;
    }
    .steps {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .steps span {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: var(--sc-line);
    }
    .steps span.on {
      background: var(--sc-gradient-button);
    }
    .skip {
      margin-left: 10px;
      min-height: 44px;
      border: 0;
      background: none;
      color: var(--sc-muted);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    h1 {
      margin-top: 10px;
      font-size: 26px;
      font-weight: 800;
    }
    p {
      margin: 0 0 8px;
      font-size: 14px;
    }
  `,
})
export class OnboardingPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);
  protected readonly saving = signal(false);
  protected readonly defaults = DEFAULT_PREFERENCES;

  async persist(preferences: Preferences): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.updatePreferences(preferences));
      this.notifier.success('Preferencias guardadas');
      await this.router.navigateByUrl('/app/inicio');
    } catch {
      this.notifier.error('No pudimos guardar tus preferencias. Intenta nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  protected skip(): void {
    void this.router.navigateByUrl('/app/inicio');
  }
}
