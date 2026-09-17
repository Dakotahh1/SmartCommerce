import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IonContent, IonIcon, IonMenu, IonRouterOutlet, IonSplitPane } from '@ionic/angular';
import { AuthService } from '../core/auth/auth.service';
import { CompareStore } from '../core/compare.store';
import { NetworkService } from '../core/network.service';
import { StatusBannerComponent } from '../shared/components/status-banner.component';

interface NavItem {
  path: string;
  label: string;
  shortLabel: string;
  icon: string;
}

/**
 * Navegación adaptable:
 * - Móvil y tableta (< 992 px): barra inferior con 4 destinos.
 * - Escritorio (≥ 992 px): menú lateral fijo (ion-split-pane) con más secciones.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonSplitPane,
    IonMenu,
    IonContent,
    IonIcon,
    IonRouterOutlet,
    RouterLink,
    RouterLinkActive,
    StatusBannerComponent,
  ],
  template: `
    <ion-split-pane contentId="sc-main" when="lg">
      <ion-menu contentId="sc-main" menuId="sc-menu" [swipeGesture]="false" class="sidebar">
        <ion-content>
          <nav class="side" aria-label="Menú principal">
            <a class="brand" routerLink="/app/inicio">
              <span class="logo" aria-hidden="true"
                ><ion-icon name="sparkles-outline"></ion-icon
              ></span>
              SmartCommerce
            </a>

            <span class="section">Menú</span>
            @for (item of navItems; track item.path) {
              <a
                class="nav-item"
                [routerLink]="item.path"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
              >
                <ion-icon [name]="item.icon" aria-hidden="true"></ion-icon>
                <span>{{ item.label }}</span>
                @if (item.path === '/app/comparar' && compare.count()) {
                  <span
                    class="badge"
                    [attr.aria-label]="compare.count() + ' productos para comparar'"
                    >{{ compare.count() }}</span
                  >
                }
              </a>
            }

            @if (auth.isStaff()) {
              <span class="section">Administración</span>
              <a
                class="nav-item"
                routerLink="/app/admin/ingesta"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
              >
                <ion-icon name="server-outline" aria-hidden="true"></ion-icon
                ><span>Ingesta de datos</span>
              </a>
              <a
                class="nav-item"
                routerLink="/app/admin/estado"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
              >
                <ion-icon name="pulse-outline" aria-hidden="true"></ion-icon
                ><span>Estado del sistema</span>
              </a>
            }

            <div class="spacer"></div>
            <div class="data-card">
              <strong
                ><ion-icon name="server-outline" aria-hidden="true"></ion-icon> Datos
                abiertos</strong
              >
              <p>Open Food Facts · productos con país de venta Chile · Licencia ODbL</p>
            </div>

            @if (auth.user(); as user) {
              <div class="user">
                <span class="avatar" aria-hidden="true">{{ initials(user.displayName) }}</span>
                <span class="who"
                  ><strong>{{ user.displayName }}</strong
                  ><small>{{ roleLabel(user.role) }}</small></span
                >
                <button type="button" class="logout" (click)="logout()" aria-label="Cerrar sesión">
                  <ion-icon name="log-out-outline"></ion-icon>
                </button>
              </div>
            } @else {
              <a class="login" routerLink="/auth/login">Iniciar sesión</a>
            }
          </nav>
        </ion-content>
      </ion-menu>

      <div class="ion-page" id="sc-main">
        @if (!network.online()) {
          <div class="offline">
            <app-status-banner
              variant="offline"
              title="Estás sin conexión"
              message="Mostramos datos guardados en este dispositivo. Algunas acciones requieren conexión."
            />
          </div>
        }
        <div class="outlet"><ion-router-outlet /></div>

        <nav class="bottom-nav" aria-label="Navegación principal">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page">
              <span class="pill"><ion-icon [name]="item.icon" aria-hidden="true"></ion-icon></span>
              <span class="label">{{ item.shortLabel }}</span>
              @if (item.path === '/app/comparar' && compare.count()) {
                <span class="dot">{{ compare.count() }}</span>
              }
            </a>
          }
        </nav>
      </div>
    </ion-split-pane>
  `,
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly compare = inject(CompareStore);
  protected readonly network = inject(NetworkService);
  private readonly router = inject(Router);

  protected readonly navItems: NavItem[] = [
    { path: '/app/inicio', label: 'Para ti', shortLabel: 'Inicio', icon: 'home-outline' },
    { path: '/app/explorar', label: 'Explorar', shortLabel: 'Explorar', icon: 'search-outline' },
    {
      path: '/app/comparar',
      label: 'Comparar',
      shortLabel: 'Comparar',
      icon: 'swap-horizontal-outline',
    },
    {
      path: '/app/perfil',
      label: 'Perfil y privacidad',
      shortLabel: 'Perfil',
      icon: 'person-outline',
    },
  ];

  protected initials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected roleLabel(role: string): string {
    return (
      { admin: 'Administrador', operator: 'Operador de datos', user: 'Usuario registrado' }[role] ??
      role
    );
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/app/explorar');
  }
}
