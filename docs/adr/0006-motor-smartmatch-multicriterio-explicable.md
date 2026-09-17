# ADR-0006: Motor SmartMatch multicriterio explicable

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

La capacidad adaptativa debe ser demostrable, evaluable, comprensible para el usuario y controlable (aceptar, modificar o rechazar), considerando sesgos y privacidad. No hay datos históricos de usuarios para entrenar modelos al inicio (arranque en frío).

## Decisión

Implementar un motor híbrido **basado en reglas + análisis de decisión multicriterio (suma ponderada con renormalización)**, con **afinidad y ajuste de pesos aprendidos** a partir del comportamiento (con decaimiento temporal y límites), **diversificación** y **explicación por criterio**. Mantener una **versión base no adaptativa** para comparación y degradación. Especificación completa en [05-motor-smartmatch.md](../05-motor-smartmatch.md).

## Alternativas consideradas

- **Filtrado colaborativo (matrix factorization)**: requiere muchos usuarios e interacciones; arranque en frío; difícil de explicar.
- **Embeddings + búsqueda semántica**: útil para búsqueda (posible EP2), pero no expresa preferencias multicriterio de forma transparente.
- **LLM para recomendar**: costo, latencia, no determinista y difícil de evaluar/auditar; podría usarse solo para redactar explicaciones en el futuro.

## Consecuencias

- (+) Funciona desde el primer uso (pesos explícitos) y mejora con la interacción.
- (+) Determinista y testeable con casos unitarios; explicaciones fieles al cálculo.
- (+) Comparable con una línea base (A/B) para la evaluación de la EF.
- (−) Capacidad expresiva limitada frente a modelos aprendidos; se mitigará incorporando señales adicionales en EF.
