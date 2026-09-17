import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AppException } from '../../common/app.exception.js';
import { Role } from '../../common/enums.js';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../../common/guards/jwt-auth.guard.js';
import type { Env } from '../../config/env.schema.js';
import { RefreshToken } from '../../database/entities/refresh-token.entity.js';
import {
  DEFAULT_WEIGHTS,
  UserPreferences,
} from '../../database/entities/user-preferences.entity.js';
import { User } from '../../database/entities/user.entity.js';
import type {
  AuthResponseDto,
  LoginDto,
  RegisterDto,
  UserProfileDto,
} from './dto/auth.dto.js';
import { PasswordHasher } from './password-hasher.service.js';

const INVALID_CREDENTIALS = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'Correo o contraseña incorrectos',
  );
const INVALID_REFRESH = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_REFRESH_TOKEN',
    'La sesión no es válida',
  );

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toProfile(user: User): UserProfileDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly tokens: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly hasher: PasswordHasher,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(
    dto: RegisterDto,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const exists = await this.users.exists({ where: { email: dto.email } });
    if (exists) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'EMAIL_TAKEN',
        'Ya existe una cuenta con ese correo',
      );
    }
    const passwordHash = await this.hasher.hash(dto.password);

    const user = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(User, {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
          role: Role.USER,
        }),
      );
      await manager.save(
        manager.create(UserPreferences, {
          userId: created.id,
          weights: { ...DEFAULT_WEIGHTS },
        }),
      );
      return created;
    });
    this.logger.log({ userId: user.id }, 'Usuario registrado');
    return this.issueSession(user, randomUUID(), userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResponseDto> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) {
      await this.hasher.verifyAgainstDummy(dto.password);
      throw INVALID_CREDENTIALS();
    }
    const valid = await this.hasher.verify(user.passwordHash, dto.password);
    if (!valid || !user.isActive) {
      this.logger.warn(
        { userId: user.id },
        'Intento de inicio de sesión fallido',
      );
      throw INVALID_CREDENTIALS();
    }
    await this.users.update(user.id, { lastLoginAt: new Date() });
    return this.issueSession(user, randomUUID(), userAgent);
  }

  /** Rotación: cada refresh token sirve una sola vez. Reutilizarlo revoca toda la familia. */
  async refresh(
    refreshToken: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const stored = await this.tokens.findOne({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored) throw INVALID_REFRESH();

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        'Reutilización de refresh token detectada',
      );
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'REFRESH_TOKEN_REUSED',
        'La sesión fue revocada por seguridad',
      );
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw INVALID_REFRESH();

    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (!user || !user.isActive) throw INVALID_REFRESH();

    return this.dataSource.transaction(async (manager) => {
      const session = await this.issueSession(
        user,
        stored.familyId,
        userAgent,
        manager.getRepository(RefreshToken),
      );
      const replacement = await manager.findOneOrFail(RefreshToken, {
        where: { tokenHash: hashToken(session.refreshToken) },
      });
      const result = await manager.update(
        RefreshToken,
        { id: stored.id, revokedAt: IsNull() },
        { revokedAt: new Date(), replacedBy: replacement.id },
      );
      if (!result.affected) throw INVALID_REFRESH(); // otra solicitud concurrente ya lo rotó
      return session;
    });
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const stored = await this.tokens.findOne({
      where: { tokenHash: hashToken(refreshToken), userId },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async me(userId: string): Promise<UserProfileDto> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'Usuario no encontrado',
      );
    return toProfile(user);
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user || !(await this.hasher.verify(user.passwordHash, password))) {
      throw INVALID_CREDENTIALS();
    }
    await this.users.delete(user.id); // ON DELETE CASCADE elimina preferencias, sesiones e historial
    this.logger.log({ userId }, 'Cuenta eliminada por su titular');
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.tokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueSession(
    user: User,
    familyId: string,
    userAgent?: string,
    repository: Repository<RefreshToken> = this.tokens,
  ): Promise<AuthResponseDto> {
    const expiresIn = this.config.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: 'HS256',
      },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    await repository.save(
      repository.create({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
        userAgent: userAgent?.slice(0, 255) ?? null,
      }),
    );
    return {
      user: toProfile(user),
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
    };
  }
}
