import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SILENT_ERRORS, SKIP_AUTH } from '../http-context';
import type { AuthResponse, Role, UserProfile } from '../models';
import { STORAGE_KEYS, StorageService } from '../storage.service';

/**
 * Sesión del usuario con signals.
 * - Access token solo en memoria (no persiste en disco).
 * - Refresh token en Capacitor Preferences; se rota en cada uso.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);
  private readonly api = `${environment.apiUrl}/v1/auth`;

  private readonly currentUser = signal<UserProfile | null>(null);
  private accessToken: string | null = null;
  private refreshInFlight: Promise<string | null> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);
  readonly isStaff = computed(() => this.role() === 'admin' || this.role() === 'operator');
  readonly firstName = computed(() => this.currentUser()?.displayName.split(' ')[0] ?? '');

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Recupera la sesión al abrir la app usando el refresh token guardado. */
  async restoreSession(): Promise<void> {
    const refreshToken = await this.storage.get<string>(STORAGE_KEYS.refreshToken);
    if (refreshToken) await this.refresh();
  }

  async login(email: string, password: string): Promise<UserProfile> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(
        `${this.api}/login`,
        { email, password },
        { context: this.publicContext() },
      ),
    );
    return this.applySession(response);
  }

  async register(email: string, password: string, displayName: string): Promise<UserProfile> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(
        `${this.api}/register`,
        { email, password, displayName },
        { context: this.publicContext() },
      ),
    );
    return this.applySession(response);
  }

  /** Una sola rotación concurrente: las solicitudes simultáneas esperan el mismo resultado. */
  refresh(): Promise<string | null> {
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  async logout(): Promise<void> {
    const refreshToken = await this.storage.get<string>(STORAGE_KEYS.refreshToken);
    if (this.accessToken && refreshToken) {
      await firstValueFrom(
        this.http.post(
          `${this.api}/logout`,
          { refreshToken },
          { context: new HttpContext().set(SILENT_ERRORS, true) },
        ),
      ).catch(() => undefined);
    }
    await this.clearSession();
  }

  async clearSession(): Promise<void> {
    this.accessToken = null;
    this.currentUser.set(null);
    await this.storage.remove(STORAGE_KEYS.refreshToken);
  }

  private async performRefresh(): Promise<string | null> {
    const refreshToken = await this.storage.get<string>(STORAGE_KEYS.refreshToken);
    if (!refreshToken) return null;
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(
          `${this.api}/refresh`,
          { refreshToken },
          { context: this.publicContext() },
        ),
      );
      await this.applySession(response);
      return response.accessToken;
    } catch (error) {
      // Sin conexión o servidor caído: se conserva el refresh token para reintentar más tarde
      // (la PWA/Android puede abrirse offline). Solo un rechazo del servidor invalida la sesión.
      const status = (error as { status?: number }).status ?? 0;
      if (status !== 0 && status < 500) await this.clearSession();
      return null;
    }
  }

  private async applySession(response: AuthResponse): Promise<UserProfile> {
    this.accessToken = response.accessToken;
    this.currentUser.set(response.user);
    await this.storage.set(STORAGE_KEYS.refreshToken, response.refreshToken);
    return response.user;
  }

  private publicContext(): HttpContext {
    return new HttpContext().set(SKIP_AUTH, true).set(SILENT_ERRORS, true);
  }
}
