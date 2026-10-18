# 4. Fuente de información web

## 4.1 Fuentes seleccionadas

| | **Open Food Facts** (principal) | **Open Prices** (complementaria) |
|---|---|---|
| Qué es | Base de datos abierta y colaborativa de productos alimenticios de todo el mundo | Base de datos abierta de precios observados por la comunidad (proyecto de Open Food Facts) |
| Acceso | API REST oficial v2: `https://world.openfoodfacts.org/api/v2/` | API REST: `https://prices.openfoodfacts.org/api/v1/` |
| Método | **API** (no scraping), JSON | **API**, JSON |
| Autenticación | No requerida para lectura | No requerida para lectura |
| Licencia de la base | Open Database License (ODbL 1.0) | ODbL 1.0 |
| Licencia del contenido | Database Contents License (DbCL 1.0); imágenes CC BY-SA | DbCL 1.0 |
| Cobertura relevante | 6.735 productos con país de venta Chile (consulta del 17-09-2026) | Cobertura en Chile muy baja (precios en CLP ≈ 2 registros); cobertura global ≈ 313.000 precios |

## 4.2 ¿Qué información necesita la aplicación?

| Dato | Campo de origen (OFF) | Uso en SmartCommerce |
|---|---|---|
| Identificador GTIN/EAN | `code` | Clave de deduplicación y enlace a la procedencia |
| Nombre y marca | `product_name`, `product_name_es`, `brands` | Búsqueda y presentación |
| Categorías | `categories_tags` | Filtros y comparación dentro de la misma categoría |
| Cantidad neta | `product_quantity`, `product_quantity_unit`, `quantity` | Precio por kg/L |
| Nutri-Score | `nutriscore_grade` | Criterio **nutrición** |
| Grupo NOVA | `nova_group` | Criterio **procesamiento** |
| Eco-Score / Green-Score | `ecoscore_grade` | Criterio **impacto ambiental** |
| Nutrientes por 100 g/ml | `nutriments.*_100g` | Cálculo de sellos "ALTO EN" (Ley 20.606) |
| Alérgenos y trazas | `allergens_tags`, `traces_tags` | Filtros duros por alérgeno |
| Etiquetas y análisis de ingredientes | `labels_tags`, `ingredients_analysis_tags` | Aptitud vegana/vegetariana/sin gluten |
| Tiendas y países | `stores_tags`, `countries_tags` | Criterio **disponibilidad** |
| Imagen | `image_front_url` | Presentación (CC BY-SA, con atribución) |
| Completitud y fecha | `completeness`, `last_modified_t` | Puntaje de calidad del dato y actualidad |
| Precio (Open Prices) | `price`, `currency`, `date`, `location` | Criterio **precio por unidad** (opcional) |

## 4.3 Obtención

- El **servicio Python** consulta la API con `httpx`, usando **solo los campos necesarios** (`fields=`) para minimizar datos y carga sobre la fuente.
- **User-Agent identificable** exigido por Open Food Facts: `SmartCommerce/<versión> (<correo de contacto>)`.
- **Límites de uso respetados** (documentados por Open Food Facts): máx. 100 solicitudes/minuto a lecturas de producto y 10/minuto a búsquedas. El cliente aplica un *rate limiter* conservador (≤ 8 búsquedas/min), paginación y **reintentos acotados con backoff exponencial** solo ante errores 5xx/429/timeout.
- **Caché** en memoria con TTL para evitar solicitudes repetidas durante una misma ingesta.
- Las ingestas se disparan de dos formas: **manual** por un `admin`/`operator` (`POST /api/v1/admin/ingestions`) y **programada** (EP2) por el `IngestionScheduler` de NestJS, que recorre periódicamente los objetivos `pais/categoria` configurados ([10 · §10.2](10-recuperacion-y-evaluacion.md#102-extracción-automatizada), [ADR-0013](adr/0013-ingesta-programada-sin-cola.md)).

Ejemplo de solicitud que realiza el servicio:

```
GET https://world.openfoodfacts.org/api/v2/search
    ?countries_tags_en=chile
    &categories_tags_en=breakfast-cereals
    &fields=code,product_name,product_name_es,brands,categories_tags,quantity,product_quantity,product_quantity_unit,nutriscore_grade,nova_group,ecoscore_grade,nutriments,allergens_tags,traces_tags,labels_tags,ingredients_analysis_tags,stores_tags,countries_tags,image_front_url,completeness,last_modified_t
    &page=1&page_size=50
User-Agent: SmartCommerce/0.1.0 (smartcommerce.equipo@example.com)
```

## 4.4 Frecuencia y estrategia de actualización

| Estrategia | Frecuencia | Estado | Detalle |
|---|---|---|---|
| Carga inicial por categorías | Bajo demanda | ✅ EP1 | Ingesta manual paginada desde *Administración › Ingesta* |
| Refresco programado | Cada 6 h en staging (`INGESTION_INTERVAL_MINUTES=360`) | ✅ EP2 | Lote de 4 categorías (`chile/breakfast-cereals`, `dairies`, `beverages`, `snacks`), hasta 2 páginas de 50 por categoría; la búsqueda de la fuente se ordena por `last_modified_t`, así cada lote trae primero lo modificado recientemente |
| Detección de cambios | En cada ingesta | ✅ | Se compara el `raw_hash` (SHA-256) del registro crudo; si no cambió, no se reescribe (`unchanged`) y solo se actualiza la fecha de recuperación |
| Actualidad | Continua | ✅ EP2 | Métrica de % desactualizado (> 14 días sin recuperar) con alerta en el reporte de calidad |
| Precios | Semanal | ⏳ EF | Open Prices por GTIN con historial (`product_prices`); cobertura en Chile casi nula (§4.1) |

Por qué cada 6 h y no más seguido: los productos envasados cambian poco (mediana de 120 días desde la última edición en la fuente, medida en EP2) y la búsqueda de Open Food Facts está limitada a 10 solicitudes por minuto; 6 h deja el catálogo al día con 8 solicitudes por lote.

## 4.5 Limpieza y normalización

1. **Validación de esquema** con Pydantic: tipos, rangos (p. ej., nutrientes entre 0 y 100 g por 100 g, NOVA 1–4) y campos obligatorios (`code`, nombre).
2. **GTIN**: se eliminan espacios/guiones, se exigen 8–14 dígitos y se verifica el **dígito de control GS1**; se canoniza a 13 dígitos cuando corresponde (UPC-A → EAN-13).
3. **Nombre**: prioridad `product_name_es` → `product_name` → `generic_name`; recorte, colapso de espacios y capitalización coherente.
4. **Marca**: primera marca de la lista, sin duplicados ni mayúsculas inconsistentes.
5. **Etiquetas** (`en:gluten`, `es:sin-gluten`): se quita el prefijo de idioma y se mapean a un vocabulario controlado (alérgenos UE: gluten, leche, huevo, maní, soya, frutos secos, etc.).
6. **Cantidades**: `"700 g"`, `"1,5 L"`, `"6 x 30 g"` → valor numérico en **g** o **ml**.
7. **Unidades de nutrientes**: sodio en mg; si falta sodio se deriva de la sal (`sodio = sal / 2,5`).
8. **Grados**: se aceptan solo `a`–`e`; valores como `unknown` o `not-applicable` se convierten en nulos.
9. **Sellos "ALTO EN" (Ley 20.606, fase final)** calculados por 100 g (sólidos) / 100 ml (líquidos):

   | Nutriente | Sólidos | Líquidos |
   |---|---|---|
   | Energía | > 275 kcal | > 70 kcal |
   | Sodio | > 400 mg | > 100 mg |
   | Azúcares totales | > 10 g | > 5 g |
   | Grasas saturadas | > 4 g | > 3 g |

   *Limitación*: la ley aplica a alimentos con azúcares, sodio o grasas saturadas **añadidos**; el cálculo es una aproximación informativa y se indica así en la interfaz.

10. **Puntaje de calidad del dato** (0–1): presencia ponderada de campos clave (nombre, marca, categoría, cantidad, Nutri-Score, NOVA, nutrientes, alérgenos) combinada con `completeness` de la fuente.

## 4.6 Detección de duplicados

- Dentro de un lote: por **GTIN canónico** (se conserva el registro con mayor `completeness` o más reciente).
- Entre ingestas: restricción `UNIQUE (gtin)` en `products` y `UNIQUE (source_id, external_id)` en `product_sources`; se usa *upsert*.
- Métrica reportada: `duplicate_count` por ejecución y **% de duplicados**.

## 4.7 Procedencia (trazabilidad)

Cada producto guarda en `product_sources`: fuente, identificador externo, **URL pública del registro** (`https://world.openfoodfacts.org/product/<gtin>`), **hash SHA-256 del dato crudo**, fecha de última modificación en la fuente, **fecha y hora de obtención** e ingesta que lo produjo (`ingestion_runs`, con `request_id` para correlacionar logs). La interfaz muestra "Fuente: Open Food Facts · actualizado <fecha> · Licencia ODbL".

## 4.8 Validación de los datos recuperados

| Control | Acción |
|---|---|
| Respuesta HTTP no 200 / JSON inválido | Reintento acotado; si persiste, la ingesta queda `failed` con mensaje |
| Registro sin GTIN válido o sin nombre | Se **rechaza** y se cuenta en `rejected_count` con el motivo |
| Valor fuera de rango | Se descarta **solo ese campo** (queda nulo) y se registra advertencia |
| Esquema de la fuente cambió | Las pruebas de contrato del adaptador fallan en CI |

## 4.9 ¿Qué ocurre si la fuente no está disponible?

- Timeout de 10 s por solicitud, 2 reintentos con backoff; luego la ingesta termina en estado `failed` o `partial` **sin afectar** los datos ya almacenados.
- La aplicación sigue funcionando con los datos persistidos en PostgreSQL (la fuente solo se consulta al ingerir).
- `/api/health` informa el estado de la fuente como `degraded` y el panel de administración lo muestra.

## 4.10 Restricciones legales, éticas y de privacidad

- **Licencias**: ODbL exige **atribución** y **compartir-igual** para bases derivadas publicadas; se atribuye en la UI, el README y la licencia del repositorio. Las imágenes (CC BY-SA) se enlazan desde la fuente, no se redistribuyen modificadas.
- **Términos de uso**: se usa la **API oficial documentada** (no se hace scraping del sitio), con User-Agent identificable y dentro de los límites de uso.
- **robots.txt**: `world.openfoodfacts.org/robots.txt` restringe `/api` a **rastreadores/indexadores**; SmartCommerce **no rastrea** el sitio: realiza consultas puntuales a la API pública destinada a aplicaciones, tal como lo documenta Open Food Facts. Esta distinción queda registrada en [ADR-0005](adr/0005-fuente-open-food-facts.md).
- **Privacidad**: la fuente no contiene datos personales; los precios de Open Prices se usan sin información de quien los aportó.
- **Sesgos de la fuente**: datos colaborativos con cobertura desigual (más productos de grandes marcas; pocos precios en Chile). Se mide la cobertura y se informa cuando falta un dato en vez de inventarlo.
- **No es consejo médico**: los puntajes son informativos.

## 4.11 Función de los datos dentro de la solución

Los datos no solo se muestran: **alimentan el buscador**, son la base de las **comparaciones multicriterio**, permiten **filtrar por restricciones** y son las variables de entrada del **motor SmartMatch**.

## 4.12 Métricas de calidad (implementadas en EP2)

% de registros válidos · % de duplicados · cobertura de campos clave y de la fuente · tiempo de recuperación (promedio y p95) · tasa de errores de la fuente por tipo · actualidad. Definiciones, umbrales de alerta y resultados reales: [10 · §10.6.1](10-recuperacion-y-evaluacion.md#1061-métricas-de-calidad-de-los-datos). La calidad del **buscador** construido sobre estos datos se mide con Precision@K, MRR y nDCG ([10 · §10.6.2](10-recuperacion-y-evaluacion.md#1062-evaluación-del-buscador-precisionk-mrr-ndcg)).

## 4.13 Revisión de uso responsable (EP2)

| Aspecto | Verificación |
|---|---|
| Método autorizado | Solo la API pública v2 documentada para aplicaciones; sin scraping de páginas HTML |
| `robots.txt` | No se rastrea el sitio; las consultas son puntuales a la API (§4.10). La prueba de aislamiento del CI lee `robots.txt` solo para verificar la salida a Internet |
| Límites de uso | ≤ 8 búsquedas/min (límite oficial 10), caché de 5 min, reintentos acotados; los lotes programados son secuenciales |
| Identificación | User-Agent con nombre, versión y contacto, configurable por ambiente (`OFF_USER_AGENT`) |
| Licencia y atribución | ODbL/DbCL atribuidas en la interfaz, el README y cada detalle de producto (procedencia con licencia y URL) |
| Privacidad | Los datos de la fuente no son personales; los logs no guardan datos de usuarios de la fuente |
| Pruebas sin cargar la fuente | El CI usa una fuente simulada con una instantánea real (`docker-compose.source-mock.yml`), así cada ejecución del pipeline no genera tráfico a Open Food Facts |
