import { createHash } from 'node:crypto';
import { hashToken } from './auth.service.js';
import { PasswordHasher } from './password-hasher.service.js';

describe('PasswordHasher (Argon2id)', () => {
  const hasher = new PasswordHasher();

  it('genera hashes argon2id con sal distinta y los verifica', async () => {
    const a = await hasher.hash('Clave-segura-2026');
    const b = await hasher.hash('Clave-segura-2026');

    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,(t=2,p=1|p=1,t=2)\$/);
    expect(a).not.toBe(b);
    await expect(hasher.verify(a, 'Clave-segura-2026')).resolves.toBe(true);
    await expect(hasher.verify(a, 'otra-clave')).resolves.toBe(false);
  });

  it('un hash corrupto no lanza excepción', async () => {
    await expect(hasher.verify('no-es-un-hash', 'x')).resolves.toBe(false);
  });

  it('la verificación contra el hash ficticio siempre falla', async () => {
    await expect(hasher.verifyAgainstDummy('lo-que-sea')).resolves.toBe(false);
  });
});

describe('hashToken', () => {
  it('almacena solo el SHA-256 del refresh token', () => {
    expect(hashToken('abc')).toBe(
      createHash('sha256').update('abc').digest('hex'),
    );
    expect(hashToken('abc')).toHaveLength(64);
  });
});
