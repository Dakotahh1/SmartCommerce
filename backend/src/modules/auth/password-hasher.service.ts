import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** Argon2id con parámetros recomendados por OWASP (19 MiB, 2 iteraciones, 1 hilo). */
@Injectable()
export class PasswordHasher {
  private static readonly OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  /** Hash precalculado para igualar tiempos cuando el usuario no existe (evita enumeración). */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, PasswordHasher.OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('smartcommerce-dummy-password');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
