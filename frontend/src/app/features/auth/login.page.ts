import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner, NavController } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';
import { isApiError } from '../../core/http/interceptors';
import { StatusBannerComponent } from '../../shared/components/status-banner.component';

/** Pantalla M02 del prototipo: inicio de sesión con formulario reactivo validado. */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    ReactiveFormsModule,
    RouterLink,
    StatusBannerComponent,
  ],
  templateUrl: './login.page.html',
  styleUrl: './auth-layout.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavController);

  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  protected invalid(control: 'email' | 'password'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.touched || field.dirty);
  }

  protected back(): void {
    this.nav.back();
  }

  async submit(): Promise<void> {
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.login(email.trim().toLowerCase(), password);
      await this.router.navigateByUrl(this.safeReturnUrl());
    } catch (error) {
      this.serverError.set(
        isApiError(error) && error.status !== 0
          ? error.status === 429
            ? 'Demasiados intentos. Espera un minuto e intenta nuevamente.'
            : 'Correo o contraseña incorrectos.'
          : 'No pudimos conectar con el servidor. Revisa tu conexión.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /** Evita redirecciones abiertas: solo rutas internas de la app. */
  private safeReturnUrl(): string {
    const url = this.returnUrl();
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/app/inicio';
  }
}
