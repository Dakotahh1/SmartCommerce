import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import type { Role } from '../models';
import { AuthService } from './auth.service';
import { authGuard, guestGuard, roleGuard } from './guards';

function setup(authenticated: boolean, role: Role | null = null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { isAuthenticated: signal(authenticated), role: signal(role) },
      },
    ],
  });
  return TestBed.inject(Router);
}

const run = (guard: typeof authGuard, url = '/app/perfil') =>
  TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );

describe('Guards de rutas', () => {
  it('authGuard redirige a login conservando la ruta solicitada', () => {
    const router = setup(false);
    const result = run(authGuard) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/auth/login?returnUrl=%2Fapp%2Fperfil');
  });

  it('authGuard permite el acceso con sesión', () => {
    setup(true, 'user');
    expect(run(authGuard)).toBe(true);
  });

  it('guestGuard envía a inicio a quien ya tiene sesión', () => {
    const router = setup(true, 'user');
    expect(router.serializeUrl(run(guestGuard) as UrlTree)).toBe('/app/inicio');
  });

  it('roleGuard bloquea a un usuario sin el rol requerido', () => {
    const router = setup(true, 'user');
    expect(
      router.serializeUrl(run(roleGuard('admin', 'operator'), '/app/admin/ingesta') as UrlTree),
    ).toBe('/app/inicio');
  });

  it('roleGuard permite a operadores y exige sesión', () => {
    setup(true, 'operator');
    expect(run(roleGuard('admin', 'operator'))).toBe(true);
    TestBed.resetTestingModule();
    const router = setup(false);
    expect(router.serializeUrl(run(roleGuard('admin'), '/app/admin/estado') as UrlTree)).toContain(
      '/auth/login',
    );
  });
});
