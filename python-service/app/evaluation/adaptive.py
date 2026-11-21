"""Evaluación del motor adaptativo contra la versión base no adaptativa.

Para cada persona de referencia y cada categoría del catálogo real se ordenan los mismos candidatos
con tres estrategias y se comparan con juicios de relevancia definidos antes de medir:

- `baseline`: versión base no adaptativa, igual para todos los usuarios (pesos fijos, sin filtros).
- `declared`: personalización solo con el perfil declarado (pesos, dietas, alérgenos, sellos).
- `adaptive`: perfil declarado + aprendizaje a partir del historial de interacciones.

Los productos con los que la persona ya interactuó se sacan de los candidatos: la evaluación mide
si el motor generaliza lo aprendido a productos nuevos, no si repite los que ya conoce.
"""

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean
from typing import Any

from app.engine.ranking import rank
from app.evaluation.metrics import (
    distinct_at_k,
    max_precision_at_k,
    ndcg_at_k,
    precision_at_k,
    violations_at_k,
)
from app.schemas.engine import HistoryEvent, ProductCandidate, Profile, RankRequest

Product = Mapping[str, Any]
STRATEGIES: tuple[str, ...] = ("baseline", "declared", "adaptive")
TOP_K = 5
NDCG_K = 10
_CANDIDATE_KEYS = frozenset(
    info.alias or name for name, info in ProductCandidate.model_fields.items()
)


def _no_allergen(values: list[str]) -> Callable[[Product], bool]:
    # Estricto: tampoco se acepta "puede contener trazas de".
    return lambda p: not any(a in p["allergens"] or a in p.get("traces", []) for a in values)


def _diet_true(diet: str) -> Callable[[Product], bool]:
    return lambda p: p["diets"].get(diet) is True


def _diet_not_false(diet: str) -> Callable[[Product], bool]:
    return lambda p: p["diets"].get(diet) is not False


RULES: dict[str, Callable[[Any], Callable[[Product], bool]]] = {
    "noAllergen": _no_allergen,
    "nutriscoreIn": lambda grades: lambda p: p.get("nutriscoreGrade") in grades,
    "maxSeals": lambda limit: lambda p: len(p["highInSeals"]) <= limit,
    "dietTrue": _diet_true,
    "dietNotFalse": _diet_not_false,
    "novaIn": lambda groups: lambda p: p.get("novaGroup") in groups,
    "novaNotIn": lambda groups: lambda p: p.get("novaGroup") not in groups,
}


def satisfies(product: Product, rules: Mapping[str, Any]) -> bool:
    """Juicio de relevancia: el producto cumple TODAS las reglas explícitas de la persona."""
    return all(RULES[name](argument)(product) for name, argument in rules.items())


def to_candidate(product: Product) -> ProductCandidate:
    """Mismos campos que NestJS envía al motor (candidate.mapper.ts); el id es el GTIN."""
    data = {key: value for key, value in product.items() if key in _CANDIDATE_KEYS}
    return ProductCandidate.model_validate({**data, "id": product["gtin"]})


@dataclass(frozen=True)
class CaseResult:
    persona: str
    query: str
    relevant: int
    max_precision: float
    precision: dict[str, float]
    ndcg: dict[str, float]
    violations: dict[str, int]
    brands: dict[str, int]
    top: dict[str, list[str]] = field(default_factory=dict)


def ranked_gtins(
    strategy: str,
    profile: Profile,
    history: Sequence[HistoryEvent],
    candidates: Sequence[ProductCandidate],
) -> list[str]:
    request = RankRequest(
        strategy="baseline" if strategy == "baseline" else "personalized",
        profile=None if strategy == "baseline" else profile,
        history=list(history) if strategy == "adaptive" else [],
        candidates=list(candidates),
        limit=NDCG_K,
    )
    return [item.gtin for item in rank(request).items]


def evaluate_case(
    persona: Mapping[str, Any],
    query: str,
    products: Sequence[Product],
    by_gtin: Mapping[str, Product],
    history_events: Sequence[Mapping[str, Any]] | None = None,
) -> CaseResult:
    events = persona["history"] if history_events is None else history_events
    seen = {event["gtin"] for event in persona["history"]}
    pool = [p for p in products if p["gtin"] not in seen]
    relevant = {p["gtin"] for p in pool if satisfies(p, persona["relevance"])}
    violating = {p["gtin"] for p in pool if not satisfies(p, persona["hardConstraints"])}
    brands = {p["gtin"]: (p.get("brand") or p["gtin"]).strip().lower() for p in pool}

    profile = Profile.model_validate(persona["profile"])
    history = [
        HistoryEvent(
            type=event["type"],
            age_days=event["ageDays"],
            product=to_candidate(by_gtin[event["gtin"]]),
        )
        for event in events
    ]
    candidates = [to_candidate(p) for p in pool]
    runs = {s: ranked_gtins(s, profile, history, candidates) for s in STRATEGIES}
    return CaseResult(
        persona=persona["id"],
        query=query,
        relevant=len(relevant),
        max_precision=max_precision_at_k(len(relevant), TOP_K),
        precision={s: precision_at_k(r, relevant, TOP_K) for s, r in runs.items()},
        ndcg={s: ndcg_at_k(r, relevant, NDCG_K) for s, r in runs.items()},
        violations={s: violations_at_k(r, violating, TOP_K) for s, r in runs.items()},
        brands={s: distinct_at_k(r, brands, TOP_K) for s, r in runs.items()},
        top={s: r[:TOP_K] for s, r in runs.items()},
    )


@dataclass(frozen=True)
class Summary:
    cases: list[CaseResult]

    @property
    def scored(self) -> list[CaseResult]:
        """Casos con al menos un relevante: sin relevantes ninguna estrategia puede acertar."""
        return [case for case in self.cases if case.relevant > 0]

    def mean_precision(self, strategy: str, persona: str | None = None) -> float:
        return _mean(c.precision[strategy] for c in self.scored if _match(c, persona))

    def mean_ndcg(self, strategy: str, persona: str | None = None) -> float:
        return _mean(c.ndcg[strategy] for c in self.scored if _match(c, persona))

    def total_violations(self, strategy: str, persona: str | None = None) -> int:
        return sum(c.violations[strategy] for c in self.cases if _match(c, persona))

    def mean_brands(self, strategy: str, persona: str | None = None) -> float:
        return _mean(c.brands[strategy] for c in self.cases if _match(c, persona))

    def mean_max_precision(self, persona: str | None = None) -> float:
        return _mean(c.max_precision for c in self.scored if _match(c, persona))


def _match(case: CaseResult, persona: str | None) -> bool:
    return persona is None or case.persona == persona


def _mean(values: Any) -> float:
    items = list(values)
    return round(mean(items), 4) if items else 0.0


def load(evaluation_dir: Path) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    catalog = json.loads((evaluation_dir / "catalog.json").read_text(encoding="utf-8"))
    personas = json.loads((evaluation_dir / "personas.json").read_text(encoding="utf-8"))
    return catalog["queries"], personas["personas"]


def evaluate(evaluation_dir: Path) -> Summary:
    queries, personas = load(evaluation_dir)
    by_gtin = {p["gtin"]: p for products in queries.values() for p in products}
    cases = [
        evaluate_case(persona, query, queries[query], by_gtin)
        for persona in personas
        for query in persona["queries"]
    ]
    return Summary(cases)


def learning_curve(
    evaluation_dir: Path, persona_id: str, steps: Sequence[int]
) -> list[tuple[int, float, float]]:
    """P@5 y nDCG@10 medios de la estrategia adaptativa con los primeros n eventos del historial."""
    queries, personas = load(evaluation_dir)
    by_gtin = {p["gtin"]: p for products in queries.values() for p in products}
    persona = next(p for p in personas if p["id"] == persona_id)
    curve = []
    for n in steps:
        cases = [
            evaluate_case(persona, query, queries[query], by_gtin, persona["history"][:n])
            for query in persona["queries"]
        ]
        summary = Summary(cases)
        curve.append((n, summary.mean_precision("adaptive"), summary.mean_ndcg("adaptive")))
    return curve
