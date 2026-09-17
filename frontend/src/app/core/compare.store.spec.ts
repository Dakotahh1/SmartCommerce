import { TestBed } from '@angular/core/testing';
import { MemoryStorage, storageProvider } from '../testing/memory-storage';
import { CompareStore } from './compare.store';
import type { ProductSummary } from './models';
import { STORAGE_KEYS } from './storage.service';

const product = (id: string): ProductSummary => ({
  id,
  gtin: `780000000000${id}`,
  name: `Producto ${id}`,
  brand: null,
  category: null,
  quantityText: null,
  imageUrl: null,
  nutriscoreGrade: 'b',
  novaGroup: 1,
  ecoscoreGrade: null,
  highInSeals: [],
  allergens: [],
  dataQualityScore: 0.5,
  price: null,
});

describe('CompareStore', () => {
  let storage: MemoryStorage;

  function create(): CompareStore {
    TestBed.configureTestingModule({ providers: [storageProvider(storage)] });
    return TestBed.inject(CompareStore);
  }

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('agrega hasta 4 productos sin duplicados y persiste la selección', async () => {
    const store = create();
    await store.ready;
    expect(store.add(product('1'))).toBe('added');
    expect(store.add(product('1'))).toBe('exists');
    expect(store.canCompare()).toBe(false);
    for (const id of ['2', '3', '4']) store.add(product(id));
    expect(store.add(product('5'))).toBe('full');
    expect(store.isFull()).toBe(true);
    expect(store.canCompare()).toBe(true);
    expect((storage.data.get(STORAGE_KEYS.compare) as ProductSummary[]).map((p) => p.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('restaura la selección guardada y permite quitar y vaciar', async () => {
    storage.data.set(STORAGE_KEYS.compare, [product('a'), product('b')]);
    const store = create();
    await store.ready;
    expect(store.count()).toBe(2);
    store.remove('a');
    expect(store.has('a')).toBe(false);
    store.clear();
    expect(store.count()).toBe(0);
  });
});
