import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AUTH_RETRIED, SILENT_ERRORS, SKIP_AUTH } from '../http-context';
import type { ApiError } from '../models';
import { NotifierService } from '../notifier.service';

const isApiRequest = (req: HttpRequest<unknown>) => req.url.startsWith(environment.apiUrl);

function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

/** Correlación extremo a extremo: Angular → NestJS → Python comparten el mismo X-Request-Id. */
export const requestIdInterceptor: HttpInterceptorFn = (req, next) =>
  isApiRequest(req) && !req.headers.has('X-Request-Id')
    ? next(req.clone({ setHeaders: { 'X-Request-Id': newRequestId() } }))
    : next(req);

/** Agrega el Bearer token y, ante un 401, refresca la sesión una sola vez y reintenta. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req) || req.context.get(SKIP_AUTH)) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getAccessToken();
  const authorized = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      const unauthorized = error instanceof HttpErrorResponse && error.status === 401;
      if (!unauthorized || !token || req.context.get(AUTH_RETRIED)) return throwError(() => error);

      return from(auth.refresh()).pipe(
        switchMap((freshToken) => {
          if (!freshToken) {
            void router.navigate(['/auth/login'], {
              queryParams: { returnUrl: router.url, reason: 'session-expired' },
            });
            return throwError(() => error);
          }
          return next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${freshToken}` },
              context: req.context.set(AUTH_RETRIED, true),
            }),
          );
        }),
      );
    }),
  );
};

export function toApiError(error: HttpErrorResponse): ApiError {
  if (error.status === 0) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'No pudimos conectar con el servidor. Revisa tu conexión.',
      details: [],
      requestId: null,
    };
  }
  const body = (error.error ?? {}) as Partial<ApiError> & { statusCode?: number };
  return {
    status: error.status,
    code: typeof body.code === 'string' ? body.code : 'HTTP_ERROR',
    message: typeof body.message === 'string' ? body.message : 'Ocurrió un error inesperado',
    details: Array.isArray(body.details) ? body.details : [],
    requestId:
      typeof body.requestId === 'string'
        ? body.requestId
        : (error.headers?.get('X-Request-Id') ?? null),
  };
}

/** Normaliza errores al formato de la API y notifica los que el usuario debe conocer. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifier = inject(NotifierService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
      const apiError = toApiError(error);
      if (!req.context.get(SILENT_ERRORS)) {
        if (apiError.status === 0) notifier.warning(apiError.message);
        else if (apiError.status === 429)
          notifier.warning('Demasiadas solicitudes. Intenta en unos segundos.');
        else if (apiError.status >= 500) {
          notifier.error(
            `${apiError.message}${apiError.requestId ? ` (ref. ${apiError.requestId.slice(0, 8)})` : ''}`,
          );
        }
      }
      return throwError(() => apiError);
    }),
  );
};

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'code' in value && 'status' in value;
}
