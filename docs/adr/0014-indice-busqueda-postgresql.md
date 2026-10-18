# ADR-0014: Índice de búsqueda en PostgreSQL con tokens normalizados por Python

- **Estado:** Aceptado
- **Fecha:** 2026-10-15

## Contexto

La EP2 pide organizar y consultar la información recuperada (corpus, tokenización/normalización, índice, criterio de ranking, resultados relevantes con metadatos) y evaluar la recuperación. La búsqueda de la EP1 usaba `to_tsvector('spanish', name || brand)` y ordenaba por calidad del dato: no aprovechaba categorías ni sellos, no ordenaba por relevancia y los datos de la fuente mezclan español e inglés (`en:breakfast-cereals`, `en:no-added-sugar`).

## Decisión

- **Python** (dueño de la normalización) genera por producto `searchPrimary` (nombre y marcas) y `searchSecondary` (nombre genérico, categorías y sellos traducidos a un **vocabulario controlado en español**), con reglas explícitas: minúsculas, sin tildes, palabras vacías, plurales regulares y prefijo `multi-`.
- **PostgreSQL** guarda una columna generada `search_vector = setweight(simple(primary), 'A') || setweight(simple(secondary), 'B')` con índice **GIN**. Se usa la configuración `simple` porque la normalización ya se hizo de forma controlada y verificable.
- **NestJS** normaliza la consulta con las **mismas reglas** (casos de prueba compartidos con Python), arma un `tsquery` de prefijos unidos con OR (solo `[a-z0-9]`, nunca operadores del usuario) y ordena por `ts_rank_cd(…, 1)` (normalización por largo del documento); los empates se resuelven por calidad del dato.
- La variante del ranking se eligió **midiendo** P@5, MRR y nDCG@5 sobre consultas juzgadas: ver [docs/10](../10-recuperacion-y-evaluacion.md).

## Alternativas

| Alternativa | Por qué no |
|---|---|
| Elasticsearch, OpenSearch o Meilisearch | Otro servicio con estado para un catálogo de miles de productos; duplica datos y sincronización |
| `unaccent` o diccionario `spanish` de PostgreSQL | `CREATE EXTENSION` exige superusuario (el rol owner no lo tiene) y el *stemmer* Snowball no es controlable ni compartible con Python |
| Búsqueda semántica con embeddings | Mayor costo y opacidad; queda como trabajo futuro si la evaluación lo justifica |

## Consecuencias

- (+) Sin componentes nuevos; índice transaccional junto a los datos; reglas trazables y probadas en ambos lenguajes.
- (+) La evaluación es reproducible en CI con PostgreSQL real.
- (−) Sin corrección ortográfica ni sinónimos (`protein` ≠ `proteína`, `Quajer` ≠ `Quaker`): limitación medida y documentada.
