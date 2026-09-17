import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from './enums.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Usuario autenticado adjuntado a la solicitud por `JwtAuthGuard`. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  id?: string | number;
};

/** Ruta accesible sin token (si se envía un token válido, igual se identifica al usuario). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe la ruta a los roles indicados. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

export const RequestId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return String(request.id ?? '');
  },
);
