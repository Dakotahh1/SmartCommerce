import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner, NavController } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';
import { isApiError } from '../../core/http/interceptors';

/** Letras y números, como exige la API. */
export function passwordStrength(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  return /[A-Za-z]/.test(value) && /\d/.test(value) ? null : { weak: true };
}

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonButton, IonIcon, IonSpinner, ReactiveFormsModule, RouterLink],
  template: `
    <ion-content [fullscreen]="true" class="auth">
      <header class="header">
        <button type="button" class="back" (click)="nav.back()" aria-label="Volver">
          <ion-icon name="arrow-back"></ion-icon>
        </button>
        <h1>Crea tu cuenta</h1>
        <p>Guarda tus preferencias y recibe recomendaciones que se adaptan a ti.</p>
      </header>

      <main class="card">
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="reg-name">Nombre</label>
            <div class="control" [class.invalid]="invalid('displayName')">
              <ion-icon name="person-outline" aria-hidden="true"></ion-icon>
              <input
                id="reg-name"
                formControlName="displayName"
                autocomplete="name"
                placeholder="Camila Vergara"
                [attr.aria-invalid]="invalid('displayName')"
              />
            </div>
            @if (invalid('displayName')) {
              <p class="error">Ingresa entre 2 y 80 caracteres, sin símbolos &lt; &gt;.</p>
            }
          </div>

          <div class="field">
            <label for="reg-email">Correo electrónico</label>
            <div class="control" [class.invalid]="invalid('email')">
              <ion-icon name="mail-outline" aria-hidden="true"></ion-icon>
              <input
                id="reg-email"
                type="email"
                formControlName="email"
                autocomplete="email"
                inputmode="email"
                placeholder="tu@correo.cl"
                [attr.aria-invalid]="invalid('email')"
              />
            </div>
            @if (invalid('email')) {
              <p class="error">Ingresa un correo válido.</p>
            }
          </div>

          <div class="field">
            <label for="reg-password">Contraseña</label>
            <div class="control" [class.invalid]="invalid('password')">
              <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
              <input
                id="reg-password"
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="new-password"
                [attr.aria-invalid]="invalid('password')"
                aria-describedby="reg-password-hint"
              />
              <button
                type="button"
                class="toggle-visibility"
                (click)="showPassword.set(!showPassword())"
                [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              >
                <ion-icon [name]="showPassword() ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
              </button>
            </div>
            <p class="hint" id="reg-password-hint" [class.error]="invalid('password')">
              Mínimo 8 caracteres, con letras y números.
            </p>
          </div>

          <label class="consent">
            <input type="checkbox" formControlName="consent" />
            <span
              >Acepto que SmartCommerce use mis preferencias e interacciones para personalizar
              recomendaciones. Puedo desactivarlo o borrar mis datos cuando quiera.</span
            >
          </label>
          @if (invalid('consent')) {
            <p class="error">Necesitamos tu consentimiento para crear la cuenta.</p>
          }

          @if (serverError()) {
            <p class="error" role="alert">{{ serverError() }}</p>
          }

          <ion-button type="submit" expand="block" class="sc-primary" [disabled]="submitting()">
            @if (submitting()) {
              <ion-spinner name="crescent" aria-label="Creando cuenta"></ion-spinner>
            } @else {
              Crear cuenta
            }
          </ion-button>
        </form>
      </main>

      <footer class="footer">
        <span>¿Ya tienes cuenta? <a routerLink="/auth/login">Inicia sesión</a></span>
      </footer>
    </ion-content>
  `,
  styleUrl: './auth-layout.scss',
  styles: `
    .consent {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 12px;
      line-height: 1.45;
      color: var(--sc-slate);
    }
    .consent input {
      width: 20px;
      height: 20px;
      margin-top: 1px;
      accent-color: var(--sc-primary);
      flex-shrink: 0;
    }
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly nav = inject(NavController);

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    displayName: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(80),
        Validators.pattern(/^[^<>]*$/),
      ],
    ],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: [
      '',
      [Validators.required, Validators.minLength(8), Validators.maxLength(128), passwordStrength],
    ],
    consent: [false, Validators.requiredTrue],
  });

  protected invalid(control: keyof typeof this.form.controls): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.touched || field.dirty);
  }

  async submit(): Promise<void> {
    this.serverError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { displayName, email, password } = this.form.getRawValue();
    try {
      await this.auth.register(email.trim().toLowerCase(), password, displayName.trim());
      await this.router.navigateByUrl('/onboarding/preferencias');
    } catch (error) {
      if (isApiError(error) && error.code === 'EMAIL_TAKEN') {
        this.serverError.set('Ya existe una cuenta con ese correo.');
      } else if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        this.serverError.set(error.details.map((d) => d.message).join(' '));
      } else {
        this.serverError.set('No pudimos crear la cuenta. Intenta nuevamente.');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
