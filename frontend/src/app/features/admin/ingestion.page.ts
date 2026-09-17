import { DatePipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { isApiError } from '../../core/http/interceptors';
import type { IngestionRun } from '../../core/models';
import { NotifierService } from '../../core/notifier.service';
import { StatusBannerComponent } from '../../shared/components/status-banner.component';

const CATEGORIES = [
  { slug: 'breakfast-cereals', label: 'Cereales de desayuno' },
  { slug: 'dairies', label: 'Lácteos' },
  { slug: 'snacks', label: 'Snacks' },
  { slug: 'beverages', label: 'Bebidas' },
  { slug: 'biscuits-and-cakes', label: 'Galletas y queques' },
  { slug: 'plant-based-foods', label: 'Alimentos de origen vegetal' },
];

/** Pantalla D03 del prototipo (admin/operator): ingesta desde Open Food Facts y métricas de calidad. */
@Component({
  selector: 'app-ingestion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    KeyValuePipe,
    StatusBannerComponent,
  ],
  templateUrl: './ingestion.page.html',
  styleUrl: './admin.scss',
})
export class IngestionPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notifier = inject(NotifierService);

  protected readonly categories = CATEGORIES;
  protected readonly runs = signal<IngestionRun[]>([]);
  protected readonly running = signal(false);
  protected readonly lastRun = signal<IngestionRun | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    category: ['breakfast-cereals', Validators.required],
    pageSize: [50, [Validators.required, Validators.min(1), Validators.max(100)]],
    page: [1, [Validators.required, Validators.min(1), Validators.max(1000)]],
  });

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.api
      .listIngestions()
      .subscribe({ next: (page) => this.runs.set(page.items), error: () => undefined });
  }

  async start(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.running.set(true);
    this.error.set(null);
    const { category, pageSize, page } = this.form.getRawValue();
    try {
      const run = await firstValueFrom(
        this.api.startIngestion({
          country: 'chile',
          category,
          pageSize: Number(pageSize),
          page: Number(page),
        }),
      );
      this.lastRun.set(run);
      this.notifier.success(
        `Ingesta completada: ${run.counts.inserted} nuevos, ${run.counts.updated} actualizados`,
      );
    } catch (error) {
      this.error.set(isApiError(error) ? error.message : 'No se pudo ejecutar la ingesta');
    } finally {
      this.running.set(false);
      this.refresh();
    }
  }

  protected statusLabel(status: IngestionRun['status']): string {
    return { running: 'En curso', completed: 'Completada', partial: 'Parcial', failed: 'Fallida' }[
      status
    ];
  }
}
