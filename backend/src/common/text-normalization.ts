/**
 * Normalización de la consulta de búsqueda. Replica exactamente las reglas con las que el
 * servicio Python construye el índice (`python-service/app/normalization/text.py`); ambos
 * lados se prueban con `python-service/tests/fixtures/text_normalization_cases.json`.
 */

const STOPWORDS_ES = new Set([
  'a', 'al', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'lo', 'los', 'o',
  'para', 'por', 'su', 'un', 'una', 'y', 'the', 'and', 'of', 'x',
]); // prettier-ignore

const PLURAL_ES_AFTER = new Set(['l', 'r', 'n', 'd']);

/** Minúsculas y sin diacríticos; deja solo `a-z0-9` separados por un espacio. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function stem(token: string): string {
  if (
    token.length > 4 &&
    token.endsWith('es') &&
    PLURAL_ES_AFTER.has(token[token.length - 3])
  ) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

/** Tokens normalizados, en orden y sin repetir. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  const result: string[] = [];
  for (const raw of fold(text).split(' ')) {
    if (raw.length < 2 || STOPWORDS_ES.has(raw)) continue;
    const token = stem(raw);
    const variants = [token];
    if (token.startsWith('multi') && token.length > 8)
      variants.push(token.slice(5));
    for (const item of variants) {
      if (!result.includes(item)) result.push(item);
    }
  }
  return result;
}

/**
 * Consulta `tsquery` segura: solo tokens `[a-z0-9]` (sin operadores del usuario), con
 * búsqueda por prefijo y unión (OR) para privilegiar la exhaustividad; el ranking
 * (`ts_rank_cd`) ordena primero los productos que contienen más términos.
 */
export function toPrefixTsQuery(text: string, maxTokens = 8): string | null {
  const tokens = tokenize(text).slice(0, maxTokens);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(' | ') : null;
}
