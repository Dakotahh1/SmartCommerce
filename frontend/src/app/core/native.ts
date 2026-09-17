import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

/** Ajustes solo para Android/iOS (Capacitor). En navegador y PWA no hace nada. */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Style.Dark = texto claro, legible sobre el violeta de la marca.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#3a22c9' });
  } catch {
    // Plataformas sin status bar configurable.
  }
  await SplashScreen.hide().catch(() => undefined);
}
