"""Métricas de ranking con juicios binarios de relevancia."""

import math
from collections.abc import Collection, Sequence


def precision_at_k(ranked: Sequence[str], relevant: Collection[str], k: int) -> float:
    """Porción de los primeros k resultados que es relevante. Mostrar menos de k cuenta como fallo:
    una lista corta no puede tener mejor precisión que una completa con los mismos aciertos."""
    hits = sum(1 for item in ranked[:k] if item in relevant)
    return hits / k


def ndcg_at_k(ranked: Sequence[str], relevant: Collection[str], k: int) -> float:
    """nDCG@k: premia los relevantes en las primeras posiciones (descuento log2 de la posición).

    Se normaliza con el mejor orden posible dado cuántos relevantes existen, así 1,0 significa
    "imposible ordenar mejor" aunque haya menos de k relevantes.
    """
    dcg = sum(
        1.0 / math.log2(position + 1)
        for position, item in enumerate(ranked[:k], start=1)
        if item in relevant
    )
    ideal_hits = min(k, len(relevant))
    ideal = sum(1.0 / math.log2(position + 1) for position in range(1, ideal_hits + 1))
    return dcg / ideal if ideal else 0.0


def violations_at_k(ranked: Sequence[str], violating: Collection[str], k: int) -> int:
    """Cuántos de los primeros k resultados incumplen una restricción dura del usuario."""
    return sum(1 for item in ranked[:k] if item in violating)


def distinct_at_k(ranked: Sequence[str], group_of: dict[str, str], k: int) -> int:
    """Cuántos grupos distintos (por ejemplo, marcas) aparecen en los primeros k resultados."""
    return len({group_of.get(item, item) for item in ranked[:k]})


def max_precision_at_k(relevant_count: int, k: int) -> float:
    """El mejor P@k alcanzable cuando solo existen `relevant_count` relevantes."""
    return min(k, relevant_count) / k
