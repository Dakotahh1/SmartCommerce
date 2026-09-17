import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Role } from '../models';
import { AuthService } from './auth.service';

/** Exige sesión; si no existe, redirige a login conservando la ruta solicitada. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated()
    ? true
    : inject(Router).createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};

/** Login y registro solo para visitantes. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/app/inicio']) : true;
};

/** Restringe la ruta a roles específicos (la API también lo valida: defensa en profundidad). */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
    }
    const role = auth.role();
    return role && roles.includes(role) ? true : router.createUrlTree(['/app/inicio']);
  };
}
