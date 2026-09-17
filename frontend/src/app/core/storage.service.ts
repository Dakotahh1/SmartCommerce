import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export const STORAGE_KEYS = {
  refreshToken: 'sc.auth.refresh',
  welcomeSeen: 'sc.welcome.seen',
  compare: 'sc.compare.items',
  recommendations: 'sc.cache.recommendations',
} as const;

/**
 * Almacenamiento clave-valor multiplataforma: SharedPreferences en Android y localStorage en web/PWA.
 * Solo guarda datos mínimos (refresh token, preferencias de UI y caché para modo sin conexión).
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const { value } = await Preferences.get({ key });
      return value === null ? null : (JSON.parse(value) as T);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}
