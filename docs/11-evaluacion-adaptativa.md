# 11. Evaluación de la capacidad adaptativa

> **Pregunta:** ¿las recomendaciones personalizadas de SmartMatch son más útiles que la versión base no adaptativa, sin violar las restricciones del usuario? Responde al objetivo **OE4** ([docs/01 §1.10](01-definicion-proyecto.md#110-objetivos): Precision@5 personalizada al menos 20 % superior a la versión base) y al plan de [docs/05 §5.8](05-motor-smartmatch.md#58-plan-de-evaluación).

**Resultado:** la estrategia adaptativa obtiene **P@5 0,667** contra **0,517** de la versión base (**+29,0 %**), **nDCG@10 0,897** contra 0,637 (**+41,0 %**) y **0 violaciones** de restricciones duras en los primeros 5 resultados, contra 12 de la versión base. La prueba corre en cada pipeline y lo bloquea si estos resultados empeoran.

## 11.1 Diseño

| Elemento | Definición |
|---|---|
| Catálogo | 197 productos **reales** de Open Food Facts Chile en las cuatro categorías que ingiere el staging (cereales, lácteos, bebidas y snacks; una página de 50 por categoría), normalizados por el mismo pipeline del servicio ([`evaluation/adaptive/catalog.json`](../evaluation/adaptive/catalog.json), licencia ODbL). La instantánea cruda está en `python-service/tests/fixtures/adaptive/` para que la evaluación no dependa de la red |
| Personas | Las tres personas de referencia de [docs/01 §1.5](01-definicion-proyecto.md#15-usuarios-objetivo) y un usuario nuevo ([`personas.json`](../evaluation/adaptive/personas.json)). Cada una tiene el perfil que declararía en la app y un historial simulado de 4 a 8 interacciones con productos reales |
| Consultas | Tres categorías por persona (las que compraría): 12 casos persona × categoría |
| Estrategias | **Base**: la versión no adaptativa, igual para todos (pesos fijos 40/0/30/20/10, sin filtros). **Perfil declarado**: personalización solo con lo que el usuario configuró. **Adaptativa**: perfil declarado + aprendizaje del historial (ajuste acotado de pesos y afinidad por categoría y marca) |
| Relevancia | Reglas explícitas por persona, escritas **antes de medir** a partir de su necesidad, no del motor (ver §11.2). Juicios binarios |
| Generalización | Los productos del historial se **sacan de los candidatos**: se mide si el motor aplica lo aprendido a productos nuevos, no si repite los que el usuario ya conoce |

### Personas y juicios de relevancia

| Persona | Perfil declarado | Relevante si… | Restricción dura (violación) |
|---|---|---|---|
| **Camila**, celíaca | Nutrición 50, procesamiento 20; dieta sin gluten; excluye gluten | No contiene gluten **ni declara trazas** y tiene Nutri-Score A o B | Contiene gluten o trazas de gluten |
| **Jorge**, presupuesto ajustado | Precio 40, nutrición 30; evitar sellos ALTO EN | No tiene sellos ALTO EN | Tiene algún sello ALTO EN |
| **Valentina**, vegana | Ambiente 35, procesamiento 35; dieta vegana | Apta para veganos **verificada** en la fuente y no ultraprocesada (NOVA distinto de 4) | Marcada como no apta para veganos |
| **Usuario nuevo** | Pesos por defecto, sin restricciones | NOVA 1 o 2 (poco procesado) | — |

El usuario nuevo no configuró nada: en su historial marca como favoritos productos poco procesados y descarta ultraprocesados. Mide la adaptación que viene **solo del comportamiento**.

## 11.2 Métricas y por qué

| Métrica | Qué mide | Por qué es pertinente |
|---|---|---|
| **P@5** | Porción de relevantes entre los 5 primeros | La lista "Para ti" muestra 5 en la primera pantalla del celular. Es la métrica del OE4 |
| **nDCG@10** | Si los relevantes aparecen arriba (descuento logarítmico por posición) | Distingue un relevante en el puesto 1 de uno en el puesto 5 |
| **Violaciones@5** | Productos entre los 5 primeros que incumplen una restricción dura | Recomendar gluten a una celíaca es peor que recomendar algo poco útil: es un riesgo |
| **Marcas distintas@5** | Diversidad de la lista | Controla el riesgo de burbuja de filtro de la personalización ([docs/05 §5.9](05-motor-smartmatch.md#59-riesgos-y-mitigaciones)) |

Con pocos relevantes en una categoría, P@5 tiene un techo: el **P@5 máximo alcanzable** medio es 0,800 (por ejemplo, Valentina tiene solo 2 snacks veganos verificados).

## 11.3 Resultados

Generados por `scripts/evaluate_adaptive.py` ([`results.json`](../evaluation/adaptive/results.json)):

| Estrategia | P@5 | nDCG@10 | Violaciones@5 | Marcas distintas@5 |
|---|---|---|---|---|
| Base no adaptativa | 0,517 | 0,637 | 12 | 4,58 |
| Perfil declarado | 0,633 | 0,871 | 0 | 4,42 |
| **Adaptativa** | **0,667** | **0,897** | **0** | 4,42 |

| Persona | Categoría | Relevantes | P@5 base → adaptativa | nDCG@10 base → adaptativa | Violaciones@5 base → adaptativa |
|---|---|---|---|---|---|
| Camila | Cereales | 10 | 0,80 → 1,00 | 0,80 → 1,00 | 1 → 0 |
| Camila | Lácteos | 10 | 0,80 → 1,00 | 0,72 → 0,93 | 0 → 0 |
| Camila | Snacks | 3 | 0,60 → 0,60 | 0,91 → 1,00 | 1 → 0 |
| Jorge | Cereales | 3 | 0,00 → 0,60 | 0,00 → 1,00 | 5 → 0 |
| Jorge | Lácteos | 21 | 1,00 → 1,00 | 1,00 → 1,00 | 0 → 0 |
| Jorge | Snacks | 4 | 0,40 → 0,80 | 0,44 → 1,00 | 3 → 0 |
| Valentina | Bebidas | 4 | 0,20 → 0,20 | 0,39 → 0,51 | 0 → 0 |
| Valentina | Cereales | 3 | 0,40 → 0,40 | 0,77 → 0,93 | 0 → 0 |
| Valentina | Snacks | 2 | 0,20 → 0,40 | 0,24 → 0,85 | 2 → 0 |
| Usuario nuevo | Cereales | 4 | 0,40 → 0,40 | 0,75 → 0,91 | 0 → 0 |
| Usuario nuevo | Lácteos | 6 | 0,60 → 0,60 | 0,64 → 0,64 | 0 → 0 |
| Usuario nuevo | Bebidas | 6 | 0,80 → 1,00 | 0,98 → 0,99 | 0 → 0 |

**Aprendizaje solo por comportamiento** (usuario nuevo, nDCG@10 según cuántas interacciones del historial se usan): 0 → 0,751 · 2 → 0,828 · 4 → 0,830 · 6 → 0,838 · 8 → 0,846.

**Interpretación**

- La mayor ganancia viene de las **restricciones**: sin perfil, la versión base recomienda cereales con sellos a Jorge (5 de 5) y productos con gluten a Camila. La personalización las respeta siempre.
- El **aprendizaje** suma sobre el perfil declarado (P@5 0,633 → 0,667; nDCG 0,871 → 0,897) y nunca empeora a una persona; para el usuario nuevo es la única fuente de adaptación y mejora el orden de forma sostenida.
- La **diversidad** casi no cambia (4,58 → 4,42 marcas en 5 resultados). Baja en Jorge porque hay pocos productos sin sellos, no por concentrarse en una marca.

## 11.4 Hallazgos que cambiaron el motor

La primera medición encontró dos debilidades; se corrigieron con reglas justificadas por la necesidad de cada persona (no ajustando hasta pasar la prueba), y se volvió a medir:

| Hallazgo | Corrección | Antes → después |
|---|---|---|
| Las **trazas** ("puede contener trazas de gluten") se guardaban pero no llegaban al motor: un producto con trazas podía recomendarse a una celíaca | El motor recibe las trazas y excluye igual que el alérgeno, con el motivo "Puede contener trazas de…" (`849f229`, `6e80cd6`) | 13 candidatos declaran trazas de gluten y 5 de ellos no lo tienen como ingrediente: el motor anterior no los excluía para Camila. En esta muestra ninguno llegó a su top 5, pero era un riesgo latente. Prueba unitaria nueva |
| Con dieta vegana declarada, productos **sin aptitud verificada** (aguas, bebidas, incluso alcohol) quedaban sobre los veganos verificados | Cada dieta sin verificar multiplica el puntaje por 0,85 (valor fijado antes de volver a medir); el producto sigue visible y advertido (`849f229`) | Valentina: P@5 0,267 → 0,333, nDCG 0,706 → 0,766. Global: P@5 +25,8 % → +29,0 % |

## 11.5 Limitaciones

- **Personas sintéticas.** Los juicios derivan de la necesidad declarada de cada persona: miden si el motor traduce bien las preferencias a un orden útil, no la satisfacción real. La validación con usuarios ([§11.7](#117-prueba-con-usuarios-protocolo)) queda como protocolo listo para aplicar.
- **Conjunto pequeño.** 12 casos y entre 2 y 21 relevantes por caso; una diferencia de 0,05 en P@5 equivale a un acierto en una categoría. Las conclusiones se apoyan en las diferencias grandes (violaciones, Jorge, Camila), no en las pequeñas.
- **Datos de la fuente.** El precio no se puede evaluar (cobertura 0 %), así que el criterio principal de Jorge no influye; la aptitud vegana está declarada en pocos productos (7 de 50 bebidas), lo que limita a Valentina en bebidas aunque el motor no se equivoque.
- **Mismo conjunto para encontrar y validar** las dos correcciones de §11.4: no hay un conjunto separado de validación. Por eso las correcciones se justificaron por seguridad y transparencia, no por la métrica.
- **Bebidas alcohólicas.** La versión base y la personalizada pueden recomendarlas en la categoría bebidas; se registra como trabajo futuro (no recomendarlas por defecto).

## 11.6 Cómo reproducir

```bash
cd python-service
uv run pytest tests/test_adaptive_evaluation.py   # compuerta: adaptativa ≥ 1,2 × base en P@5, 0 violaciones
uv run python scripts/evaluate_adaptive.py        # tabla en Markdown y evaluation/adaptive/results.json

# Opcional: nueva instantánea de la fuente (cambia los datos, y por lo tanto los resultados)
uv run python scripts/fetch_off_snapshot.py && uv run python scripts/build_adaptive_corpus.py
```

En el pipeline, el job **Servicio Python** ejecuta la compuerta dentro de pytest, publica la tabla en el resumen de la ejecución y falla si `results.json` no corresponde al código evaluado.

## 11.7 Prueba con usuarios (protocolo)

Para el OE6 y como validación de las personas sintéticas, con 5 a 8 participantes y el staging:

1. **Tareas** (cronometradas, éxito sí/no): configurar restricciones; encontrar un cereal apto para su caso; comparar 3 productos y elegir; marcar "No me interesa" y ver que la lista cambia.
2. **Comprensión** (1 a 5): "Entiendo por qué me recomendó este producto" (desglose y razones).
3. **Utilidad percibida** (1 a 5) de la lista personalizada frente a la general (la personalización se puede desactivar desde el perfil para comparar).

Metas: tasa de éxito ≥ 80 % y comprensión ≥ 4/5. Los resultados se agregarán a esta sección cuando se aplique.
