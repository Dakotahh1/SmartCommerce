# ADR-0005: Open Food Facts y Open Prices como fuentes web vía API oficial

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

La solución debe obtener información desde al menos una fuente web externa, de forma responsable (licencia, términos, robots.txt, privacidad) y con datos **reales** que permitan comparar productos más allá del precio.

## Decisión

Usar **Open Food Facts** (API REST v2) como fuente principal de productos y **Open Prices** como fuente complementaria de precios, accediendo solo por sus **APIs oficiales documentadas**, con User-Agent identificable, campos mínimos (`fields=`), límites de uso respetados, reintentos acotados y caché. Vertical inicial: productos envasados con país de venta Chile.

Sobre `robots.txt`: el archivo del sitio restringe `/api` para **rastreadores e indexadores**. SmartCommerce no rastrea ni indexa el sitio; realiza consultas puntuales a la API que Open Food Facts publica explícitamente para aplicaciones de terceros. Si la política de la fuente cambia, se usarán los **volcados de datos abiertos** (JSONL/Parquet) que Open Food Facts publica para uso masivo.

## Alternativas consideradas

| Alternativa | Motivo de descarte |
|---|---|
| Scraping de sitios de supermercados chilenos | Términos de servicio restrictivos, robots.txt, fragilidad y riesgo legal |
| API de Mercado Libre | Requiere token OAuth para búsqueda desde 2025; catálogo sin atributos de calidad comparables |
| DummyJSON / Fake Store API | Datos ficticios: no cumplen "información real" (EP2) |
| Solo volcados masivos de OFF | Archivos de varios GB; útil para carga masiva futura, no para ingestas incrementales en EP1 |

## Consecuencias

- (+) Datos reales, abiertos y con licencia clara (ODbL/DbCL/CC BY-SA).
- (+) Atributos de calidad estandarizados (Nutri-Score, NOVA, Eco-Score, alérgenos) que habilitan la comparación multicriterio.
- (−) Datos colaborativos con campos faltantes → se mide cobertura y se muestra la incertidumbre.
- (−) Cobertura de precios en Chile casi nula → el precio es un criterio opcional; se evaluará complementar con datos abiertos oficiales de precios (p. ej., ODEPA) en EP2.
- Obligación de **atribución** visible en la UI y documentación.
