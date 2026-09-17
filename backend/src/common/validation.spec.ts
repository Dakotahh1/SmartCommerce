import { ArgumentMetadata, HttpException } from '@nestjs/common';
import { RegisterDto } from '../modules/auth/dto/auth.dto.js';
import { ProductQueryDto } from '../modules/catalog/products.dto.js';
import { UpdatePreferencesDto } from '../modules/preferences/preferences.dto.js';
import { CompareProductsDto } from '../modules/recommendations/recommendations.dto.js';
import { createValidationPipe } from './validation.js';

const pipe = createValidationPipe();

async function validate<T>(
  metatype: new () => T,
  value: unknown,
  type: ArgumentMetadata['type'] = 'body',
) {
  try {
    return {
      ok: true as const,
      value: (await pipe.transform(value, { type, metatype })) as T,
    };
  } catch (error) {
    const body = (error as HttpException).getResponse() as {
      code: string;
      details: Array<{ field: string; message: string }>;
    };
    return { ok: false as const, body };
  }
}

describe('Validación de DTO', () => {
  it('normaliza el correo y acepta un registro válido', async () => {
    const result = await validate(RegisterDto, {
      email: '  Camila@Correo.CL ',
      password: 'Clave-segura-2026',
      displayName: ' Camila ',
    });
    expect(result.ok && result.value.email).toBe('camila@correo.cl');
    expect(result.ok && result.value.displayName).toBe('Camila');
  });

  it('rechaza propiedades no declaradas (no se puede auto-asignar rol)', async () => {
    const result = await validate(RegisterDto, {
      email: 'a@b.cl',
      password: 'Clave-segura-2026',
      displayName: 'Ana',
      role: 'admin',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.body.code).toBe('VALIDATION_ERROR');
    expect(
      !result.ok && result.body.details.some((d) => d.field === 'role'),
    ).toBe(true);
  });

  it('exige contraseñas con letras y números y nombres sin HTML', async () => {
    const result = await validate(RegisterDto, {
      email: 'no-es-correo',
      password: 'solo-letras',
      displayName: '<b>x</b>',
    });
    expect(
      !result.ok && result.body.details.map((d) => d.field).sort(),
    ).toEqual(['displayName', 'email', 'password']);
  });

  it('valida pesos, dietas y alérgenos de las preferencias', async () => {
    const valid = await validate(UpdatePreferencesDto, {
      weights: {
        nutrition: 30,
        price: 25,
        processing: 20,
        environment: 15,
        availability: 10,
      },
      diets: ['gluten_free'],
      excludedAllergens: ['peanuts'],
      avoidHighIn: true,
      preferredStores: ['lider'],
      personalizationEnabled: true,
    });
    expect(valid.ok).toBe(true);

    const invalid = await validate(UpdatePreferencesDto, {
      weights: {
        nutrition: 130,
        price: -1,
        processing: 20,
        environment: 15,
        availability: 10,
      },
      diets: ['carnivora'],
      excludedAllergens: ['kryptonita'],
      avoidHighIn: 'si',
      preferredStores: ['Líder; DROP TABLE'],
      personalizationEnabled: true,
    });
    const fields = !invalid.ok ? invalid.body.details.map((d) => d.field) : [];
    expect(fields).toEqual(
      expect.arrayContaining([
        'weights.nutrition',
        'weights.price',
        'diets',
        'excludedAllergens',
        'avoidHighIn',
        'preferredStores',
      ]),
    );
  });

  it('transforma y acota query params del catálogo', async () => {
    const result = await validate(
      ProductQueryDto,
      { q: 'avena', nutriscore: 'A,b', page: '2', limit: '10' },
      'query',
    );
    expect(result.ok && result.value).toMatchObject({
      page: 2,
      limit: 10,
      nutriscore: ['a', 'b'],
      sort: 'quality',
    });

    const tooMany = await validate(ProductQueryDto, { limit: '500' }, 'query');
    expect(tooMany.ok).toBe(false);
  });

  it('la comparación exige entre 2 y 4 UUID distintos', async () => {
    const id = '2f1d3c7e-8f3a-4b8e-9c2a-1b2c3d4e5f60';
    expect((await validate(CompareProductsDto, { productIds: [id] })).ok).toBe(
      false,
    );
    expect(
      (await validate(CompareProductsDto, { productIds: [id, id] })).ok,
    ).toBe(false);
    expect(
      (
        await validate(CompareProductsDto, {
          productIds: [id, '9b7e0a4c-2d1f-4e6a-8b3c-5d7e9f1a2b3c'],
        })
      ).ok,
    ).toBe(true);
  });
});
