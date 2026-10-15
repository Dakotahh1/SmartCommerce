import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { ApiService } from '../../core/api.service';
import type { DataQualityReport } from '../../core/models';
import { StatusBannerComponent } from '../../shared/components/status-banner.component';

const FIELD_LABELS: Record<string, string> = {
  brand: 'Marca',
  category: 'Categoría',
  quantity: 'Cantidad neta',
  nutriscore: 'Nutri-Score',
  nova: 'NOVA',
  ecoscore: 'Eco-Score',
  nutriments: 'Nutrientes (sellos)',
  image: 'Imagen',
  stores: 'Tiendas',
  price: 'Precio',
};

/**
 * Calidad de la información recuperada desde la Web (EP2): validez, duplicados, cobertura,
 * actualidad, errores y tiempos de la fuente, con alertas por umbral. Solo admin/operator.
 */
@Component({
  selector: 'app-data-quality-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    DatePipe,
    DecimalPipe,
    PercentPipe,
    StatusBannerComponent,
  ],
  template: `
    <ion-content [fullscreen]="true">
      <main class="sc-page admin">
        <header class="head">
          <div>
            <h1>Calidad de los datos</h1>
            <p class="sc-muted">
              Open Food Facts → Python → PostgreSQL · últimos {{ days() }} días de ingestas
            </p>
          </div>
          <div class="actions" role="group" aria-label="Ventana de análisis">
            @for (option of windows; track option) {
              <ion-button
                size="small"
                [fill]="days() === option ? 'solid' : 'outline'"
                [attr.aria-pressed]="days() === option"
                (click)="setDays(option)"
                >{{ option }} días</ion-button
              >
            }
            <ion-button size="small" fill="clear" (click)="load()" aria-label="Actualizar">
              <ion-icon slot="icon-only" name="refresh-outline" aria-hidden="true"></ion-icon>
            </ion-button>
          </div>
        </header>

        @if (loading() && !report()) {
          <ion-spinner name="crescent" aria-label="Cargando métricas"></ion-spinner>
        }
        @if (error()) {
          <app-status-banner
            variant="degraded"
            title="No se pudo calcular el reporte"
            [message]="error()"
          />
        }

        @if (report(); as r) {
          <section class="alerts" aria-label="Alertas de calidad">
            @for (alert of r.alerts; track alert.code) {
              <app-status-banner
                variant="degraded"
                [title]="alert.message"
                [message]="alert.code"
              />
            } @empty {
              <app-status-banner
                variant="success"
                title="Sin alertas"
                message="Todas las métricas están dentro de los umbrales definidos."
              />
            }
          </section>

          <section class="kpis" aria-label="Indicadores principales">
            <div class="kpi">
              <span>Registros válidos</span>
              <strong>{{ pct(r.validity.validRatio) }}</strong>
              <small>{{ r.validity.valid }} de {{ r.validity.fetched }} recuperados</small>
            </div>
            <div class="kpi">
              <span>Duplicados en la fuente</span>
              <strong>{{ pct(r.validity.duplicateRatio) }}</strong>
              <small>{{ r.validity.duplicates }} registros descartados</small>
            </div>
            <div class="kpi">
              <span>Catálogo al día</span>
              <strong>{{
                pct(r.freshness.staleRatio === null ? null : 1 - r.freshness.staleRatio)
              }}</strong>
              <small>Desactualizado tras {{ r.freshness.staleAfterDays }} días</small>
            </div>
            <div class="kpi">
              <span>Ingestas fallidas</span>
              <strong>{{ pct(r.reliability.errorRate) }}</strong>
              <small>{{ r.reliability.failed }} de {{ r.reliability.runs }} ejecuciones</small>
            </div>
            <div class="kpi">
              <span>Tiempo de ingesta</span>
              <strong>{{ seconds(r.reliability.avgDurationMs) }}</strong>
              <small>p95 {{ seconds(r.reliability.p95DurationMs) }}</small>
            </div>
            <div class="kpi">
              <span>Productos indexados</span>
              <strong>{{ r.catalog.products }}</strong>
              <small>{{ pct(r.catalog.indexedRatio) }} con índice de búsqueda</small>
            </div>
          </section>

          <section class="sc-card">
            <h2>Cobertura de campos del catálogo</h2>
            <ul class="coverage">
              @for (field of coverage(r); track field.key) {
                <li>
                  <span>{{ field.label }}</span>
                  <div
                    class="track"
                    role="meter"
                    [attr.aria-label]="field.label"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-valuenow]="field.value * 100"
                  >
                    <div class="fill" [style.width.%]="field.value * 100"></div>
                  </div>
                  <strong>{{ field.value | percent: '1.0-0' }}</strong>
                </li>
              }
            </ul>
            <p class="note">
              Calidad promedio del dato:
              {{ r.catalog.avgDataQualityScore ?? 0 | number: '1.2-2' }} / 1 · edad mediana:
              {{ r.freshness.medianAgeHours ?? '—' }} h desde la última recuperación;
              {{ r.freshness.medianSourceAgeDays ?? '—' }} días desde la última edición en la
              fuente.
            </p>
          </section>

          <section class="sc-card">
            <h2>Cobertura de la fuente por categoría</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Categoría</th>
                    <th scope="col">Disponibles en la fuente</th>
                    <th scope="col">Almacenados</th>
                    <th scope="col">Cobertura</th>
                    <th scope="col">Última ingesta</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of r.sourceCoverage; track row.category) {
                    <tr>
                      <td>{{ row.category }}</td>
                      <td>{{ row.totalAvailable ?? '—' }}</td>
                      <td>{{ row.stored }}</td>
                      <td>{{ pct(row.coverageRatio) }}</td>
                      <td>{{ row.lastRunAt | date: 'dd-MM HH:mm' }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5">Aún no hay ingestas completadas.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="services">
            <article class="sc-card service">
              <h2>Fuente externa (Open Food Facts)</h2>
              @if (r.source; as s) {
                <p>
                  {{ s.requests }} solicitudes · {{ s.errorRate | percent: '1.0-1' }} con error ·
                  {{ s.avgMs | number: '1.0-0' }} ms promedio (p95 {{ s.p95Ms | number: '1.0-0' }}
                  ms)
                </p>
                @if (s.lastError; as e) {
                  <small>Último error: {{ e.outcome }} · {{ e.at | date: 'dd-MM HH:mm' }}</small>
                }
              } @else {
                <small>Métricas no disponibles (servicio Python sin respuesta).</small>
              }
            </article>
            <article class="sc-card service">
              <h2>Principales motivos de rechazo</h2>
              <ul class="reasons">
                @for (reason of r.validity.topRejectionReasons; track reason.reason) {
                  <li>
                    <span>{{ reason.reason }}</span
                    ><strong>{{ reason.count }}</strong>
                  </li>
                } @empty {
                  <li><span>Sin rechazos en la ventana</span></li>
                }
              </ul>
            </article>
            <article class="sc-card service">
              <h2>Fallas recientes</h2>
              <ul class="reasons">
                @for (failure of r.reliability.recentFailures; track failure.id) {
                  <li>
                    <span
                      >{{ failure.startedAt | date: 'dd-MM HH:mm' }} · {{ failure.trigger }}</span
                    >
                    <small>{{ failure.error }}</small>
                  </li>
                } @empty {
                  <li><span>Sin fallas en la ventana</span></li>
                }
              </ul>
            </article>
          </section>
        }
      </main>
    </ion-content>
  `,
  styleUrl: './admin.scss',
})
export class DataQualityPage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly windows = [7, 30, 90];
  protected readonly days = signal(30);
  protected readonly report = signal<DataQualityReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getDataQuality(this.days()).subscribe({
      next: (report) => {
        this.report.set(report);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: { message?: string }) => {
        this.error.set(err.message ?? 'Sin respuesta del servidor');
        this.loading.set(false);
      },
    });
  }

  protected coverage(report: DataQualityReport): { key: string; label: string; value: number }[] {
    return Object.entries(report.catalog.fieldCoverage).map(([key, value]) => ({
      key,
      label: FIELD_LABELS[key] ?? key,
      value: value ?? 0,
    }));
  }

  protected pct(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 1000) / 10} %`;
  }

  protected seconds(ms: number | null): string {
    return ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`;
  }
}
