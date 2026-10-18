import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fold, stem, toPrefixTsQuery, tokenize } from './text-normalization.js';

// Casos compartidos con el servicio Python: índice y consulta deben coincidir token a token.
const { cases } = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      '../python-service/tests/fixtures/text_normalization_cases.json',
    ),
    'utf8',
  ),
) as { cases: { input: string; tokens: string[] }[] };

describe('normalización de texto (paridad con Python)', () => {
  it.each(cases)('tokenize($input)', ({ input, tokens }) => {
    expect(tokenize(input)).toEqual(tokens);
  });

  it('pliega diacríticos y símbolos', () => {
    expect(fold('Ñandú CAFÉ-con_Leche!')).toBe('nandu cafe con leche');
  });

  it.each([
    ['cereales', 'cereal'],
    ['panes', 'pan'],
    ['chocolates', 'chocolate'],
    ['cross', 'cross'],
    ['gas', 'gas'],
  ])('stem(%s) = %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
});

describe('toPrefixTsQuery', () => {
  it('construye una unión de prefijos con tokens normalizados', () => {
    expect(toPrefixTsQuery('Avena Instantánea')).toBe(
      'avena:* | instantanea:*',
    );
  });

  it('neutraliza operadores de tsquery e inyección', () => {
    const query = toPrefixTsQuery("avena' & !(x) | <-> ;DROP TABLE products");
    expect(query).toBe('avena:* | drop:* | table:* | product:*');
    expect(query).toMatch(/^[a-z0-9:* |]+$/);
  });

  it('devuelve null si no queda ningún término útil', () => {
    expect(toPrefixTsQuery('de la y')).toBeNull();
    expect(toPrefixTsQuery('!!!')).toBeNull();
  });

  it('limita la cantidad de términos', () => {
    const query = toPrefixTsQuery(
      'uno dos tres cuatro cinco seis siete ocho nueve diez',
    );
    expect(query?.split(' | ')).toHaveLength(8);
  });
});
