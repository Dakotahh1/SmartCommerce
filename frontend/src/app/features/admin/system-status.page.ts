import { DecimalPipe, KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { ApiService } from '../../core/api.service';
import type { HealthReport, MetricsSnapshot } from '../../core/models';

/** Estado del sistema: salud de API, base de datos, SmartMatch y fuente web + métricas por ruta. */
@Component({
  selector: 'app-system-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonButton, IonIcon, DecimalPipe, KeyValuePipe],
  template: `
    <ion-content [fullscreen]="true">
      <main class="sc-page admin">
        <header class="head">
          <div>
            <h1>Estado del sistema</h1>
            <p class="sc-muted">GET /api/health · se actualiza cada 15 s</p>
          </div>
          <ion-button fill="outline" (click)="load()"
            ><ion-icon slot="start" name="refresh-outline"></ion-icon>Actualizar</ion-button
          >
        </header>

        @if (health(); as h) {
          <section class="overall" [class]="'overall ' + h.status" role="status">
            <strong>{{
              h.status === 'ok'
                ? 'Todo operativo'
                : h.status === 'degraded'
                  ? 'Funcionando en modo degradado'
                  : 'Servicio no disponible'
            }}</strong>
            <span
              >Versión {{ h.version }} · {{ h.environment }} · activo hace
              {{ h.uptimeSeconds / 60 | number: '1.0-0' }} min</span
            >
          </section>

          <section class="services">
            @for (service of services(h); track service.name) {
              <article class="sc-card service">
                <div class="service-head">
                  <span
                    class="dot"
                    [class.down]="service.status === 'down'"
                    aria-hidden="true"
                  ></span>
                  <strong>{{ service.name }}</strong>
                  <span class="badge" [class.down]="service.status === 'down'">{{
                    service.status === 'up' ? 'Operativo' : 'Caído'
                  }}</span>
                </div>
                <small>{{ service.detail }}</small>
              </article>
            }
          </section>
        } @else if (error()) {
          <section class="overall down" role="status">
            <strong>No se pudo consultar el estado</strong><span>{{ error() }}</span>
          </section>
        }

        @if (metrics(); as m) {
          <section class="sc-card">
            <h2>Latencia por ruta (ventana de 500 solicitudes)</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Ruta</th>
                    <th scope="col">Solicitudes</th>
                    <th scope="col">Errores 5xx</th>
                    <th scope="col">Promedio</th>
                    <th scope="col">p95</th>
                  </tr>
                </thead>
                <tbody>
                  @for (route of m.routes | keyvalue; track route.key) {
                    <tr>
                      <td class="route">{{ route.key }}</td>
                      <td>{{ route.value.count }}</td>
                      <td [class.bad]="route.value.errors5xx > 0">{{ route.value.errors5xx }}</td>
                      <td>{{ route.value.avgMs | number: '1.0-1' }} ms</td>
                      <td>{{ route.value.p95Ms | number: '1.0-1' }} ms</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      </main>
    </ion-content>
  `,
  styleUrl: './admin.scss',
})
export class SystemStatusPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly health = signal<HealthReport | null>(null);
  protected readonly metrics = signal<MetricsSnapshot | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const timer = setInterval(() => this.load(), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.api.health().subscribe({
      next: (report) => {
        this.health.set(report);
        this.error.set(null);
      },
      error: (err: { message?: string; status?: number }) => {
        // 503 igual trae el reporte en el cuerpo, pero lo mostramos como caído.
        this.error.set(err.message ?? 'Sin respuesta');
      },
    });
    this.api.metrics().subscribe({ next: (m) => this.metrics.set(m), error: () => undefined });
  }

  protected services(h: HealthReport) {
    return [
      {
        name: 'API principal (NestJS)',
        status: h.checks.api.status,
        detail: 'Autenticación, catálogo y orquestación',
      },
      {
        name: 'PostgreSQL',
        status: h.checks.database.status,
        detail:
          h.checks.database.latencyMs !== undefined
            ? `Latencia ${h.checks.database.latencyMs} ms`
            : 'Persistencia principal',
      },
      {
        name: 'SmartMatch (FastAPI)',
        status: h.checks.smartmatch.status,
        detail: `Circuito ${h.checks.smartmatch.circuit ?? 'n/d'}`,
      },
      {
        name: 'Open Food Facts',
        status: h.checks.openfoodfacts.status,
        detail: h.checks.openfoodfacts.detail ?? 'Fuente web de productos',
      },
    ];
  }
}
