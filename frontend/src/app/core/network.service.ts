import { Injectable, signal } from '@angular/core';
import { Network } from '@capacitor/network';

/** Estado de conectividad (Capacitor Network en Android, eventos online/offline en web). */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly isOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly online = this.isOnline.asReadonly();

  constructor() {
    Network.getStatus()
      .then((status) => this.isOnline.set(status.connected))
      .catch(() => undefined);
    Network.addListener('networkStatusChange', (status) =>
      this.isOnline.set(status.connected),
    ).catch(() => undefined);
  }
}
