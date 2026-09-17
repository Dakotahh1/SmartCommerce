import { HttpContextToken } from '@angular/common/http';

/** La solicitud no debe llevar token ni intentar refrescar la sesión (login, registro, refresh). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

/** La solicitud ya fue reintentada tras refrescar el token (evita ciclos). */
export const AUTH_RETRIED = new HttpContextToken<boolean>(() => false);

/** El componente maneja el error: no mostrar notificación global. */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);
