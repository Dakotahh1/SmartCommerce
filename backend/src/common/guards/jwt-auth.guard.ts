import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';
import { AppException } from '../app.exception.js';
import {
  AuthenticatedRequest,
  AuthUser,
  IS_PUBLIC_KEY,
} from '../auth.decorators.js';
import { Role } from '../enums.js';

export const JWT_ISSUER = 'smartcommerce-api';
export const JWT_AUDIENCE = 'smartcommerce-app';

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

/**
 * Guard global: exige un access token válido salvo en rutas `@Public()`.
 * En rutas públicas, si llega un token válido se identifica al usuario (personalización opcional).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      if (isPublic) return true;
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_REQUIRED',
        'Debes iniciar sesión',
      );
    }

    try {
      request.user = await this.verify(token);
      return true;
    } catch (error) {
      if (isPublic) return true;
      if (error instanceof TokenExpiredError) {
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          'TOKEN_EXPIRED',
          'La sesión expiró',
        );
      }
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_TOKEN',
        'Token inválido',
      );
    }
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }

  private async verify(token: string): Promise<AuthUser> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (!payload.sub || !Object.values(Role).includes(payload.role)) {
      throw new Error('payload inválido');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
