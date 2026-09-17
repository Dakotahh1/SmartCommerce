import type { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth/guards';
import { welcomeGuard } from './core/auth/welcome.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/inicio' },
  {
    path: 'bienvenida',
    title: 'Bienvenida · SmartCommerce',
    loadComponent: () => import('./features/welcome/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: 'auth/login',
    title: 'Iniciar sesión · SmartCommerce',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/registro',
    title: 'Crear cuenta · SmartCommerce',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'onboarding/preferencias',
    title: 'Tus preferencias · SmartCommerce',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: 'app',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Para ti · SmartCommerce',
        canActivate: [welcomeGuard],
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'explorar',
        title: 'Explorar · SmartCommerce',
        loadComponent: () => import('./features/explore/explore.page').then((m) => m.ExplorePage),
      },
      {
        path: 'producto/:id',
        title: 'Producto · SmartCommerce',
        loadComponent: () =>
          import('./features/product/product-detail.page').then((m) => m.ProductDetailPage),
      },
      {
        path: 'comparar',
        title: 'Comparar · SmartCommerce',
        loadComponent: () => import('./features/compare/compare.page').then((m) => m.ComparePage),
      },
      {
        path: 'perfil',
        title: 'Perfil y transparencia · SmartCommerce',
        canActivate: [authGuard],
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'admin/ingesta',
        title: 'Ingesta de datos · SmartCommerce',
        canActivate: [roleGuard('admin', 'operator')],
        loadComponent: () => import('./features/admin/ingestion.page').then((m) => m.IngestionPage),
      },
      {
        path: 'admin/estado',
        title: 'Estado del sistema · SmartCommerce',
        canActivate: [roleGuard('admin', 'operator')],
        loadComponent: () =>
          import('./features/admin/system-status.page').then((m) => m.SystemStatusPage),
      },
    ],
  },
  { path: '**', redirectTo: 'app/inicio' },
];
