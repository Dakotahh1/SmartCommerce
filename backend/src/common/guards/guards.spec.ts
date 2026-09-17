import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  type AuthenticatedRequest,
} from '../auth.decorators.js';
import { Role } from '../enums.js';
import { JWT_AUDIENCE, JWT_ISSUER, JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

const SECRET = 'jwt-secret-for-unit-tests-0123456789abcdef';
const jwt = new JwtService();
const config = { get: () => SECRET } as unknown as ConfigService<never, true>;

function contextFor(
  request: Partial<AuthenticatedRequest>,
  metadata: Record<string, unknown> = {},
) {
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { reflector, context };
}

function sign(payload: object, options: Record<string, unknown> = {}) {
  return jwt.sign(payload, {
    secret: SECRET,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: 60,
    ...options,
  });
}

async function codeOf(promise: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof promise === 'function' ? promise() : promise);
    return 'OK';
  } catch (error) {
    return ((error as HttpException).getResponse() as { code: string }).code;
  }
}

describe('JwtAuthGuard', () => {
  it('rechaza rutas protegidas sin token (401 AUTH_REQUIRED)', async () => {
    const { reflector, context } = contextFor({ headers: {} });
    expect(
      await codeOf(
        new JwtAuthGuard(reflector, jwt, config).canActivate(context),
      ),
    ).toBe('AUTH_REQUIRED');
  });

  it('adjunta el usuario con un token válido', async () => {
    const request: Partial<AuthenticatedRequest> = {
      headers: {
        authorization: `Bearer ${sign({ sub: 'u1', email: 'a@b.cl', role: Role.USER })}`,
      },
    };
    const { reflector, context } = contextFor(request);
    await expect(
      new JwtAuthGuard(reflector, jwt, config).canActivate(context),
    ).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'u1',
      email: 'a@b.cl',
      role: Role.USER,
    });
  });

  it('distingue token expirado de token inválido', async () => {
    const expired = sign(
      { sub: 'u1', email: 'a@b.cl', role: Role.USER },
      { expiresIn: -10 },
    );
    const forged = jwt.sign(
      { sub: 'u1', role: Role.ADMIN },
      { secret: 'otro-secreto-cualquiera-0123456789' },
    );
    const wrongAudience = sign(
      { sub: 'u1', email: 'a@b.cl', role: Role.USER },
      { audience: 'otra-app' },
    );

    for (const [token, code] of [
      [expired, 'TOKEN_EXPIRED'],
      [forged, 'INVALID_TOKEN'],
      [wrongAudience, 'INVALID_TOKEN'],
    ] as const) {
      const { reflector, context } = contextFor({
        headers: { authorization: `Bearer ${token}` },
      });
      expect(
        await codeOf(
          new JwtAuthGuard(reflector, jwt, config).canActivate(context),
        ),
      ).toBe(code);
    }
  });

  it('rechaza un rol desconocido dentro del token', async () => {
    const token = sign({ sub: 'u1', email: 'a@b.cl', role: 'superuser' });
    const { reflector, context } = contextFor({
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      await codeOf(
        new JwtAuthGuard(reflector, jwt, config).canActivate(context),
      ),
    ).toBe('INVALID_TOKEN');
  });

  it('en rutas públicas permite el acceso anónimo e ignora tokens inválidos', async () => {
    const anonymous = contextFor({ headers: {} }, { [IS_PUBLIC_KEY]: true });
    await expect(
      new JwtAuthGuard(anonymous.reflector, jwt, config).canActivate(
        anonymous.context,
      ),
    ).resolves.toBe(true);

    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer basura' },
    };
    const invalid = contextFor(request, { [IS_PUBLIC_KEY]: true });
    await expect(
      new JwtAuthGuard(invalid.reflector, jwt, config).canActivate(
        invalid.context,
      ),
    ).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });
});

describe('RolesGuard', () => {
  it('permite rutas sin roles declarados', () => {
    const { reflector, context } = contextFor({ headers: {} });
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('un token válido de usuario no da acceso a rutas de administración (403)', async () => {
    const { reflector, context } = contextFor(
      { user: { id: 'u1', email: 'a@b.cl', role: Role.USER } },
      { [ROLES_KEY]: [Role.ADMIN] },
    );
    expect(
      await codeOf(() => new RolesGuard(reflector).canActivate(context)),
    ).toBe('FORBIDDEN');
  });

  it('permite el rol autorizado y exige sesión', async () => {
    const allowed = contextFor(
      { user: { id: 'u1', email: 'a@b.cl', role: Role.OPERATOR } },
      { [ROLES_KEY]: [Role.ADMIN, Role.OPERATOR] },
    );
    expect(new RolesGuard(allowed.reflector).canActivate(allowed.context)).toBe(
      true,
    );

    const anonymous = contextFor({}, { [ROLES_KEY]: [Role.ADMIN] });
    expect(
      await codeOf(() =>
        new RolesGuard(anonymous.reflector).canActivate(anonymous.context),
      ),
    ).toBe('AUTH_REQUIRED');
  });
});
