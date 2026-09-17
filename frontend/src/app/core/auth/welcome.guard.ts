import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { STORAGE_KEYS, StorageService } from '../storage.service';
import { AuthService } from './auth.service';

/** Muestra la bienvenida solo en la primera visita de un visitante sin sesión. */
export const welcomeGuard: CanActivateFn = async () => {
  if (inject(AuthService).isAuthenticated()) return true;
  const router = inject(Router);
  const seen = await inject(StorageService).get<boolean>(STORAGE_KEYS.welcomeSeen);
  return seen ? true : router.createUrlTree(['/bienvenida']);
};
