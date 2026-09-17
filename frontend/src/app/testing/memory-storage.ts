import { StorageService } from '../core/storage.service';

/** Almacenamiento en memoria para pruebas (reemplaza Capacitor Preferences). */
export class MemoryStorage implements Pick<StorageService, 'get' | 'set' | 'remove'> {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export const storageProvider = (storage = new MemoryStorage()) => ({
  provide: StorageService,
  useValue: storage,
});
