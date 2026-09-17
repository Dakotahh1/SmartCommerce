import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonSkeletonText,
  ViewWillEnter,
} from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import type { InteractionRecord, Preferences } from '../../core/models';
import { NotifierService } from '../../core/notifier.service';
import { PreferencesFormComponent } from './preferences-form.component';

const INTERACTION_LABELS: Record<string, string> = {
  view: 'Viste un producto',
  favorite: 'Marcaste un favorito',
  unfavorite: 'Quitaste un favorito',
  compare: 'Agregaste a comparar',
  dismiss: 'Descartaste un producto',
  recommendation_click: 'Abriste una recomendación',
  recommendation_accept: 'Aceptaste una recomendación',
  recommendation_reject: 'Rechazaste una recomendación',
};

/** Pantalla M08 del prototipo: control de la personalización, transparencia y derechos sobre los datos. */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonButton, IonIcon, IonSkeletonText, DatePipe, PreferencesFormComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage implements ViewWillEnter {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly notifier = inject(NotifierService);
  private readonly alerts = inject(AlertController);
  private readonly router = inject(Router);

  protected readonly preferences = signal<Preferences | null>(null);
  protected readonly history = signal<InteractionRecord[]>([]);
  protected readonly saving = signal(false);
  protected readonly labels = INTERACTION_LABELS;

  ionViewWillEnter(): void {
    this.api
      .getPreferences()
      .subscribe({ next: (p) => this.preferences.set(p), error: () => undefined });
    this.api
      .getInteractions()
      .subscribe({ next: (h) => this.history.set(h), error: () => undefined });
  }

  async save(preferences: Preferences): Promise<void> {
    this.saving.set(true);
    try {
      this.preferences.set(await firstValueFrom(this.api.updatePreferences(preferences)));
      this.notifier.success('Preferencias actualizadas: tus recomendaciones se recalcularán');
    } catch {
      this.notifier.error('No pudimos guardar tus preferencias');
    } finally {
      this.saving.set(false);
    }
  }

  protected async resetLearning(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Restablecer aprendizaje',
      message: 'Se borrará tu historial de interacciones. Tus pesos declarados se mantienen.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Restablecer',
          role: 'destructive',
          handler: () => {
            this.api.resetLearning().subscribe({
              next: () => {
                this.history.set([]);
                this.notifier.success('Aprendizaje restablecido');
              },
              error: () => undefined,
            });
          },
        },
      ],
    });
    await alert.present();
  }

  protected async deleteAccount(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Eliminar cuenta',
      message:
        'Se eliminarán tu cuenta, preferencias e historial de forma permanente. Confirma con tu contraseña.',
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: 'Contraseña',
          attributes: { autocomplete: 'current-password' },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: (data: { password: string }) => {
            if (!data.password) return false;
            this.api.deleteAccount(data.password).subscribe({
              next: async () => {
                await this.auth.clearSession();
                this.notifier.success('Tu cuenta y tus datos fueron eliminados');
                await this.router.navigateByUrl('/bienvenida');
              },
              error: () => this.notifier.error('Contraseña incorrecta o servicio no disponible'),
            });
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/app/explorar');
  }
}
