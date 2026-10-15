import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { DataQualityReport } from '../../core/models';
import { DataQualityPage } from './data-quality.page';

function report(overrides: Partial<DataQualityReport> = {}): DataQualityReport {
  return {
    generatedAt: '2026-10-15T12:00:00Z',
    windowDays: 30,
    thresholds: {
      minValidRatio: 0.8,
      maxDuplicateRatio: 0.1,
      maxStaleRatio: 0.2,
      maxErrorRate: 0.2,
    },
    catalog: {
      products: 23,
      indexedRatio: 1,
      avgDataQualityScore: 0.71,
      fieldCoverage: { brand: 0.913, nutriscore: 0.5, price: null },
    },
    validity: {
      fetched: 24,
      valid: 23,
      rejected: 1,
      duplicates: 0,
      validRatio: 0.958,
      duplicateRatio: 0,
      topRejectionReasons: [{ reason: 'Producto sin nombre', count: 1 }],
    },
    freshness: {
      staleAfterDays: 14,
      tracked: 23,
      stale: 0,
      staleRatio: 0,
      oldestFetchAt: null,
      newestFetchAt: null,
      medianAgeHours: 2.5,
      medianSourceAgeDays: 180,
    },
    sourceCoverage: [
      {
        category: 'breakfast-cereals',
        totalAvailable: 117,
        stored: 23,
        coverageRatio: 0.197,
        lastRunAt: '2026-10-15T11:00:00Z',
      },
    ],
    reliability: {
      runs: 5,
      failed: 1,
      scheduled: 4,
      errorRate: 0.2,
      avgDurationMs: 2300,
      p95DurationMs: 4100,
      lastSuccessAt: '2026-10-15T11:00:00Z',
      recentFailures: [],
      changes: { inserted: 23, updated: 0, unchanged: 0 },
    },
    source: { requests: 6, errors: 1, errorRate: 0.167, avgMs: 640, p95Ms: 1200, lastError: null },
    alerts: [],
    ...overrides,
  };
}

describe('DataQualityPage', () => {
  async function render(getDataQuality: ApiService['getDataQuality']) {
    const api = { getDataQuality: vi.fn(getDataQuality) };
    TestBed.configureTestingModule({
      providers: [provideIonicAngular(), { provide: ApiService, useValue: api }],
    });
    const fixture = TestBed.createComponent(DataQualityPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, api, element: fixture.nativeElement as HTMLElement };
  }

  it('muestra indicadores, cobertura y ausencia de alertas', async () => {
    const { element, api } = await render(() => of(report()));
    expect(api.getDataQuality).toHaveBeenCalledWith(30);
    const text = element.textContent ?? '';
    expect(text).toContain('95.8 %');
    expect(text).toContain('Sin alertas');
    expect(text).toContain('Producto sin nombre');
    expect(text).toContain('breakfast-cereals');
    expect(element.querySelectorAll('.coverage li')).toHaveLength(3);
    expect(element.querySelector('[role="meter"]')?.getAttribute('aria-label')).toBe('Marca');
  });

  it('presenta las alertas y permite cambiar la ventana de análisis', async () => {
    const { element, api, fixture } = await render(() =>
      of(
        report({ alerts: [{ code: 'STALE_DATA', message: '40 % del catálogo no se actualiza' }] }),
      ),
    );
    expect(element.textContent).toContain('40 % del catálogo no se actualiza');

    const sevenDays = [...element.querySelectorAll('ion-button')].find((b) =>
      b.textContent?.includes('7 días'),
    ) as HTMLElement;
    sevenDays.click();
    fixture.detectChanges();
    expect(api.getDataQuality).toHaveBeenLastCalledWith(7);
  });

  it('informa el error si el reporte no se puede calcular', async () => {
    const { element } = await render(() => throwError(() => ({ message: 'Sin permisos' })));
    expect(element.textContent).toContain('No se pudo calcular el reporte');
    expect(element.textContent).toContain('Sin permisos');
  });
});
