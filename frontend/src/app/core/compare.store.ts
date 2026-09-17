import { computed, inject, Injectable, signal } from '@angular/core';
import type { ProductSummary } from './models';
import { STORAGE_KEYS, StorageService } from './storage.service';

export const MAX_COMPARE = 4;

/** Productos seleccionados para comparar (persisten entre sesiones, incluso sin conexión). */
@Injectable({ providedIn: 'root' })
export class CompareStore {
  private readonly storage = inject(StorageService);
  private readonly selected = signal<ProductSummary[]>([]);

  readonly items = this.selected.asReadonly();
  readonly count = computed(() => this.selected().length);
  readonly isFull = computed(() => this.count() >= MAX_COMPARE);
  readonly canCompare = computed(() => this.count() >= 2);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.storage.get<ProductSummary[]>(STORAGE_KEYS.compare).then((saved) => {
      if (saved?.length) this.selected.set(saved.slice(0, MAX_COMPARE));
    });
  }

  has(productId: string): boolean {
    return this.selected().some((p) => p.id === productId);
  }

  add(product: ProductSummary): 'added' | 'exists' | 'full' {
    if (this.has(product.id)) return 'exists';
    if (this.isFull()) return 'full';
    this.selected.update((items) => [...items, product]);
    void this.persist();
    return 'added';
  }

  remove(productId: string): void {
    this.selected.update((items) => items.filter((p) => p.id !== productId));
    void this.persist();
  }

  clear(): void {
    this.selected.set([]);
    void this.persist();
  }

  private persist(): Promise<void> {
    return this.storage.set(STORAGE_KEYS.compare, this.selected());
  }
}
