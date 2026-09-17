# ADR-0001: Registrar decisiones de arquitectura con ADR

- **Estado:** Aceptado
- **Fecha:** 2026-09-17

## Contexto

El enunciado exige justificar las principales decisiones arquitectónicas y cada integrante debe poder explicarlas en la defensa individual. Las decisiones se toman de forma incremental entre EP1, EP2 y EF.

## Decisión

Registrar cada decisión significativa como un archivo Markdown numerado en `docs/adr/`, con contexto, decisión, alternativas y consecuencias. Todo ADR nuevo se incorpora mediante pull request.

## Alternativas consideradas

- **Wiki de GitHub**: queda fuera del control de versiones del código y de las revisiones de PR.
- **Comentarios en el código**: no capturan alternativas descartadas ni el contexto.

## Consecuencias

- (+) Trazabilidad entre decisiones, código y entregas etiquetadas.
- (+) Material de estudio para la defensa técnica.
- (−) Requiere disciplina para mantenerlos actualizados.
