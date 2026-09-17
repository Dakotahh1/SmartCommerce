# 5. Capacidad adaptativa: motor SmartMatch

> Especificación v0.1 (EP1). En EP1 se implementan el ranking multicriterio, los filtros, la explicación y la versión base no adaptativa; el aprendizaje de preferencias queda con una función inicial probada y se integra completamente en la EF.

## 5.1 Resumen

| Pregunta del enunciado | Respuesta |
|---|---|
| ¿Qué componente se adapta? | La **selección y el orden** de las recomendaciones ("Para ti"), el **ganador y la explicación** de las comparaciones y los **pesos efectivos** del perfil. |
| ¿A quién se adapta? | A cada consumidor registrado (`user`). Visitantes y usuarios con personalización desactivada reciben la **versión base no adaptativa**. |
| ¿Qué variables activan la adaptación? | Pesos declarados (5 criterios), dietas, alérgenos excluidos, preferencia de evitar sellos, tiendas preferidas e **historial de interacciones** (vistas, favoritos, comparaciones, aceptaciones y descartes) con decaimiento temporal. |
| ¿Qué decisión toma el sistema? | Qué productos mostrar, en qué orden, cuáles excluir y por qué; qué producto gana una comparación para esa persona. |
| ¿Qué mecanismo se utiliza? | **Filtros basados en reglas** + **puntuación multicriterio ponderada** (MCDA, suma ponderada con renormalización ante datos faltantes) + **afinidad y ajuste de pesos aprendidos** del comportamiento + **diversificación** por marca. |
| ¿Cómo comprende el usuario la decisión? | Puntaje 0–100, **desglose por criterio** (valor, peso y contribución), **razones en lenguaje natural** y advertencias de datos faltantes. |
| ¿Cómo acepta, modifica o rechaza? | Botones "No me interesa" / "Ver detalle", edición de pesos, "Restablecer aprendizaje" y **interruptor para desactivar la personalización**. |
| ¿Cómo se evalúa su utilidad? | Precision@K y nDCG@K contra la versión base, tasa de aceptación/descartes y estudio con usuarios (sección 5.8). |
| ¿Riesgos? | Sesgo por completitud de datos y por popularidad, burbuja de filtro, privacidad del historial y opacidad (sección 5.9). |

## 5.2 Entradas

**Productos candidatos** (normalizados, desde PostgreSQL): GTIN, marca, categoría, Nutri-Score, NOVA, Eco-Score, sellos Ley 20.606, alérgenos, dietas verificadas, tiendas, precio por kg/L (si existe) y puntaje de calidad del dato.

**Perfil** (desde PostgreSQL): pesos explícitos `w` (0–100) de `nutrition`, `price`, `processing`, `environment`, `availability`; `diets`; `excludedAllergens`; `avoidHighIn`; `preferredStores`; `personalizationEnabled`.

**Historial** (últimos 90 días): tipo de interacción, antigüedad en días y producto involucrado.

## 5.3 Filtros duros (reglas)

| Regla | Condición de exclusión | Razón mostrada |
|---|---|---|
| Alérgenos | `allergens ∩ excludedAllergens ≠ ∅` | "Contiene gluten" |
| Dieta vegana/vegetariana | dieta verificada explícitamente como **no** apta | "No es apto para dieta vegana" |
| Sin gluten | contiene alérgeno gluten | "Contiene gluten" |
| Sin lactosa | contiene leche y no tiene etiqueta "sin lactosa" | "Contiene lactosa" |
| Evitar sellos | `avoidHighIn` y `highInSeals ≠ ∅` | "Tiene sellos ALTO EN: azúcares" |

Si la aptitud para una dieta **no se puede verificar** (dato desconocido), el producto **no se excluye**, pero se agrega la advertencia "Aptitud vegana no verificada".

## 5.4 Criterios y funciones de valor (0 a 1)

| Criterio | Función de valor |
|---|---|
| `nutrition` | Nutri-Score: A = 1,00 · B = 0,80 · C = 0,55 · D = 0,30 · E = 0,10. Sin Nutri-Score pero con nutrientes: `max(0,1; 0,9 − 0,2 × n.º de sellos)` |
| `processing` | NOVA 1 = 1,00 · 2 = 0,80 · 3 = 0,50 · 4 = 0,15 |
| `environment` | Eco-Score A = 1,00 · B = 0,80 · C = 0,55 · D = 0,30 · E = 0,10 |
| `price` | Precio por kg/L `p` frente a la mediana `m` de los candidatos de la misma categoría con precio: `clamp(0,5 + 0,5 × (m − p) / m, 0, 1)`. Un solo precio → 0,5 |
| `availability` | `min(1, tiendas / 5)`; si coincide con una tienda preferida → `max(valor, 0,9)` |

Un criterio **sin dato** no se inventa: queda como *faltante*.

## 5.5 Puntuación

Sea `A` el conjunto de criterios con dato y `w` los pesos efectivos:

```
base       = Σ_{c∈A} w_c · v_c  /  Σ_{c∈A} w_c                  (renormalización)
cobertura  = Σ_{c∈A} w_c  /  Σ_{c} w_c                          (0..1)
confianza  = 0,7 + 0,3 · cobertura                              (penaliza datos incompletos)
afinidad   = 0,6 · afinidad_categoría + 0,4 · afinidad_marca    (−1..1)
score      = 100 · clamp(base · confianza · (1 + 0,1 · afinidad), 0, 1)
```

- **Desglose**: por criterio se informa `valor`, `peso normalizado` y `contribución = 100 · confianza · w_c · v_c / Σ_{c∈A} w_c`.
- **Diversificación**: selección voraz que multiplica por `0,95^k` el puntaje del k-ésimo producto repetido de la misma marca.
- **Desempate**: mayor calidad del dato y luego GTIN.

### Versión base no adaptativa (control)

Mismos datos, **mismo resultado para todos**: pesos fijos `nutrition 40 · processing 30 · environment 20 · availability 10 · price 0`, sin filtros personales, sin afinidad ni aprendizaje. Se usa para visitantes, cuando el usuario desactiva la personalización y como **línea base de evaluación**. NestJS tiene una implementación equivalente en TypeScript como **respaldo** si el servicio Python no responde (respuesta marcada `degraded: true`).

## 5.6 Aprendizaje a partir del comportamiento

**Señal por tipo de interacción** (`s`): favorito +1,0 · aceptar recomendación +0,8 · comparar +0,3 · vista +0,1 · quitar favorito −0,5 · descartar −0,8 · rechazar recomendación −1,0.

**Decaimiento temporal**: `d = 0,5^(antigüedad_días / 14)` (vida media de 14 días).

**Afinidad** por categoría y marca: `afinidad = tanh(Σ s · d / 3)` ∈ (−1, 1).

**Ajuste de pesos** (explicable y acotado): para cada interacción con un producto cuyos valores por criterio son `v`, se desplaza el peso de cada criterio hacia los atributos en los que ese producto destaca:

```
Δw_c += η · s · d · (v_c − media(v))        con η = 8 puntos
Δw_c  = clamp(Δw_c, −15, +15)
w_efectivo_c = clamp(w_explícito_c + Δw_c, 0, 100)
```

La interfaz muestra "definido por ti" vs. "aprendido" y permite **restablecer** el aprendizaje (borra los ajustes, no el historial) o **desactivarlo**.

## 5.7 Salida y contrato

`POST /v1/recommendations/rank` (servicio Python, interno) devuelve:

```json
{
  "engineVersion": "0.1.0",
  "strategy": "personalized",
  "weightsUsed": { "nutrition": 33.1, "price": 25.0, "processing": 20.0, "environment": 13.4, "availability": 8.5 },
  "learnedAdjustments": { "nutrition": 3.1, "price": 0.0, "processing": 0.0, "environment": -1.6, "availability": -1.5 },
  "items": [
    {
      "gtin": "7802000014130",
      "rank": 1,
      "score": 91.8,
      "coverage": 0.9,
      "breakdown": [
        { "criterion": "nutrition", "label": "Nutrición", "value": 0.8, "weight": 0.331, "contribution": 28.1 }
      ],
      "reasons": ["NOVA 1: sin procesar o mínimamente procesado", "Nutri-Score B", "Sin sellos ALTO EN"],
      "warnings": ["Precio no disponible"]
    }
  ],
  "excluded": [{ "gtin": "7801234567890", "reasons": ["Contiene gluten"] }],
  "stats": { "candidates": 40, "excluded": 3, "ranked": 10, "tookMs": 4.2 }
}
```

## 5.8 Plan de evaluación

| Nivel | Método | Métrica | Meta |
|---|---|---|---|
| Unitario (CI) | Casos de prueba deterministas: filtros, renormalización, desempates, explicación, aprendizaje acotado | 100 % de casos esperados | EP1 |
| Offline | 3 personas sintéticas (sección 1.5) con conjuntos relevantes etiquetados sobre el catálogo real | Precision@5, nDCG@10 personalizado vs. base | +20 % |
| Online (staging) | Registro en `recommendation_logs` y `user_interactions` | Tasa de aceptación, descarte, clic | Aceptación ≥ 30 % |
| Usuarios | Prueba con 5–8 personas: elegir entre alternativas con y sin SmartMatch | Tiempo, éxito, utilidad y comprensión (1–5) | ≥ 4/5 |

## 5.9 Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Sesgo por datos incompletos**: productos con menos datos quedan abajo | Factor de confianza acotado (mín. 0,7), advertencias visibles, métrica de cobertura por categoría |
| **Sesgo de popularidad / marcas grandes** (más datos en la fuente) | Sin criterio de popularidad; diversificación por marca |
| **Burbuja de filtro** | Límite de ±15 puntos al aprendizaje, diversificación, opción de restablecer |
| **Privacidad del historial** | Consentimiento al registrarse, retención de 180 días, eliminación de cuenta y datos, exportación de datos, historial nunca enviado a terceros |
| **Opacidad** | Desglose y razones en cada recomendación; versión del motor registrada |
| **Errores de la fuente** (Nutri-Score mal cargado) | Procedencia visible con enlace al registro original; validaciones de rango |
| **Uso como consejo médico** | Aviso explícito: información referencial |
