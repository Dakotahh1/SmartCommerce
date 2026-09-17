import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ApiError } from '../models';
import { NotifierService } from '../notifier.service';
import {
  authInterceptor,
  errorInterceptor,
  requestIdInterceptor,
  toApiError,
} from './interceptors';

describe('Interceptores HTTP', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const auth = {
    getAccessToken: vi.fn<() => string | null>(),
    refresh: vi.fn<() => Promise<string | null>>(),
  };
  const notifier = { warning: vi.fn(), error: vi.fn(), success: vi.fn() };
  const url = `${environment.apiUrl}/v1/recommendations`;

  beforeEach(() => {
    auth.getAccessToken.mockReset();
    auth.refresh.mockReset();
    notifier.error.mockReset();
    notifier.warning.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([requestIdInterceptor, errorInterceptor, authInterceptor]),
        ),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: NotifierService, useValue: notifier },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('agrega Authorization y X-Request-Id solo a la API propia', async () => {
    auth.getAccessToken.mockReturnValue('token-1');
    const api = firstValueFrom(http.get(url));
    const external = firstValueFrom(http.get('https://images.openfoodfacts.org/x.json'));

    const apiReq = backend.expectOne(url);
    expect(apiReq.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(apiReq.request.headers.get('X-Request-Id')).toMatch(/.{8,}/);
    apiReq.flush({});

    const extReq = backend.expectOne('https://images.openfoodfacts.org/x.json');
    expect(extReq.request.headers.has('Authorization')).toBe(false);
    expect(extReq.request.headers.has('X-Request-Id')).toBe(false);
    extReq.flush({});
    await Promise.all([api, external]);
  });

  it('ante 401 refresca una vez y reintenta con el token nuevo', async () => {
    auth.getAccessToken.mockReturnValue('token-expirado');
    auth.refresh.mockResolvedValue('token-nuevo');
    const result = firstValueFrom(http.get<{ ok: boolean }>(url));

    backend
      .expectOne(url)
      .flush({ code: 'TOKEN_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = backend.expectOne(url);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer token-nuevo');
    retry.flush({ ok: true });

    expect(await result).toEqual({ ok: true });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('si el refresh falla, envía a login y propaga el error normalizado', async () => {
    auth.getAccessToken.mockReturnValue('token-expirado');
    auth.refresh.mockResolvedValue(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const result = firstValueFrom(http.get(url)).catch((e: ApiError) => e);

    backend
      .expectOne(url)
      .flush(
        { code: 'TOKEN_EXPIRED', message: 'La sesión expiró' },
        { status: 401, statusText: 'Unauthorized' },
      );
    const error = (await result) as ApiError;

    expect(error).toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(navigate).toHaveBeenCalledWith(
      ['/auth/login'],
      expect.objectContaining({
        queryParams: expect.objectContaining({ reason: 'session-expired' }),
      }),
    );
  });

  it('normaliza errores 5xx y notifica con la referencia del request id', async () => {
    auth.getAccessToken.mockReturnValue(null);
    const result = firstValueFrom(http.get(url)).catch((e: ApiError) => e);
    backend.expectOne(url).flush(
      {
        statusCode: 503,
        code: 'SMARTMATCH_UNAVAILABLE',
        message: 'Servicio no disponible',
        details: [],
        requestId: 'abcdef123456',
      },
      { status: 503, statusText: 'Service Unavailable' },
    );
    expect(await result).toMatchObject({
      status: 503,
      code: 'SMARTMATCH_UNAVAILABLE',
      requestId: 'abcdef123456',
    });
    expect(notifier.error).toHaveBeenCalledWith('Servicio no disponible (ref. abcdef12)');
  });

  it('traduce la falta de conexión a un error comprensible', () => {
    const error = toApiError(new HttpErrorResponse({ status: 0 }));
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(error.message).toContain('conexión');
  });
});
