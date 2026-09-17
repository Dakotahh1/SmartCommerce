import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { MemoryStorage, storageProvider } from '../../testing/memory-storage';
import type { AuthResponse } from '../models';
import { STORAGE_KEYS } from '../storage.service';
import { AuthService } from './auth.service';

const session = (refreshToken = 'refresh-1', role: 'user' | 'admin' = 'user'): AuthResponse => ({
  user: {
    id: 'u1',
    email: 'camila@correo.cl',
    displayName: 'Camila Vergara',
    role,
    createdAt: '2026-09-17',
  },
  accessToken: `access-${refreshToken}`,
  refreshToken,
  tokenType: 'Bearer',
  expiresIn: 900,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let storage: MemoryStorage;
  const api = `${environment.apiUrl}/v1/auth`;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), storageProvider(storage)],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('inicia sesión: guarda el refresh token y expone el usuario con signals', async () => {
    const login = auth.login('camila@correo.cl', 'Clave-segura-2026');
    http.expectOne(`${api}/login`).flush(session());
    const user = await login;

    expect(user.displayName).toBe('Camila Vergara');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.firstName()).toBe('Camila');
    expect(auth.isStaff()).toBe(false);
    expect(auth.getAccessToken()).toBe('access-refresh-1');
    expect(storage.data.get(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('restaura la sesión con el refresh token guardado', async () => {
    storage.data.set(STORAGE_KEYS.refreshToken, 'refresh-guardado');
    const restore = auth.restoreSession();
    await flush();
    const req = http.expectOne(`${api}/refresh`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-guardado' });
    req.flush(session('refresh-rotado', 'admin'));
    await restore;

    expect(auth.role()).toBe('admin');
    expect(auth.isStaff()).toBe(true);
    expect(storage.data.get(STORAGE_KEYS.refreshToken)).toBe('refresh-rotado');
  });

  it('refrescos concurrentes comparten una sola solicitud (evita reutilizar el token rotado)', async () => {
    storage.data.set(STORAGE_KEYS.refreshToken, 'refresh-1');
    const first = auth.refresh();
    const second = auth.refresh();
    await flush();
    http.expectOne(`${api}/refresh`).flush(session('refresh-2'));
    expect(await first).toBe('access-refresh-2');
    expect(await second).toBe('access-refresh-2');
  });

  it('un refresh rechazado por el servidor cierra la sesión', async () => {
    storage.data.set(STORAGE_KEYS.refreshToken, 'refresh-revocado');
    const refresh = auth.refresh();
    await flush();
    http
      .expectOne(`${api}/refresh`)
      .flush({ code: 'REFRESH_TOKEN_REUSED' }, { status: 401, statusText: 'Unauthorized' });

    expect(await refresh).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(storage.data.has(STORAGE_KEYS.refreshToken)).toBe(false);
  });

  it('sin conexión conserva el refresh token para reintentar (modo offline)', async () => {
    storage.data.set(STORAGE_KEYS.refreshToken, 'refresh-1');
    const refresh = auth.refresh();
    await flush();
    http.expectOne(`${api}/refresh`).error(new ProgressEvent('error'), { status: 0 });

    expect(await refresh).toBeNull();
    expect(storage.data.get(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('cierra sesión revocando el token en el servidor y limpiando el dispositivo', async () => {
    const login = auth.login('camila@correo.cl', 'Clave-segura-2026');
    http.expectOne(`${api}/login`).flush(session());
    await login;

    const logout = auth.logout();
    await flush();
    const req = http.expectOne(`${api}/logout`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await logout;

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getAccessToken()).toBeNull();
    expect(storage.data.size).toBe(0);
  });
});
