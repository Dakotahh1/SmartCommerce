import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';

/** Notificaciones breves y accesibles (Ionic Toast anuncia su contenido a lectores de pantalla). */
@Injectable({ providedIn: 'root' })
export class NotifierService {
  private readonly toasts = inject(ToastController);

  success(message: string): void {
    void this.show(message, 'success', 'checkmark-circle-outline');
  }

  warning(message: string): void {
    void this.show(message, 'warning', 'alert-circle-outline');
  }

  error(message: string): void {
    void this.show(message, 'danger', 'close-circle-outline');
  }

  private async show(message: string, color: string, icon: string): Promise<void> {
    try {
      const toast = await this.toasts.create({
        message,
        color,
        icon,
        duration: 3500,
        position: 'top',
        buttons: [{ text: 'Cerrar', role: 'cancel' }],
      });
      await toast.present();
    } catch {
      // Sin DOM (pruebas) no hay toasts que mostrar.
    }
  }
}
