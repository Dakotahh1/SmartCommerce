import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../app.exception.js';
import { AuthenticatedRequest, ROLES_KEY } from '../auth.decorators.js';
import { Role } from '../enums.js';

/** Un token válido no da acceso a todo: cada ruta declara los roles permitidos. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_REQUIRED',
        'Debes iniciar sesión',
      );
    }
    if (!roles.includes(user.role)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'No tienes permisos para realizar esta acción',
      );
    }
    return true;
  }
}
