import { FormControl } from '@angular/forms';
import { passwordStrength } from './register.page';

describe('Validación de formularios de autenticación', () => {
  it('exige letras y números en la contraseña (igual que la API)', () => {
    expect(passwordStrength(new FormControl('soloLetras', { nonNullable: true }))).toEqual({
      weak: true,
    });
    expect(passwordStrength(new FormControl('12345678', { nonNullable: true }))).toEqual({
      weak: true,
    });
    expect(
      passwordStrength(new FormControl('Clave-segura-2026', { nonNullable: true })),
    ).toBeNull();
  });
});
