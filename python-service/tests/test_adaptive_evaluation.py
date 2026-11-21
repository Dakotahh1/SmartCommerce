"""Evaluación del motor adaptativo contra la versión base (docs/11-evaluacion-adaptativa.md).

Las métricas se prueban con casos a mano; la evaluación completa corre sobre el catálogo real de
`evaluation/adaptive/` y bloquea el pipeline si la personalización deja de superar a la versión
base o si recomienda algo que viola una restricción dura del usuario.
"""

import math
from pathlib import Path
from typing import Any, ClassVar

import pytest
from app.evaluation.adaptive import Summary, evaluate, learning_curve, satisfies
from app.evaluation.metrics import (
    distinct_at_k,
    max_precision_at_k,
    ndcg_at_k,
    precision_at_k,
    violations_at_k,
)

EVALUATION_DIR = Path(__file__).resolve().parents[2] / "evaluation" / "adaptive"
# OE4 (docs/01 §1.10): Precision@5 personalizada al menos 20 % sobre la versión base.
MIN_PRECISION_LIFT = 1.2


class TestMetrics:
    def test_precision_counts_hits_in_top_k_and_penalizes_short_lists(self) -> None:
        assert precision_at_k(["a", "x", "b", "y", "z"], {"a", "b"}, 5) == 0.4
        assert precision_at_k(["a", "b"], {"a", "b"}, 5) == 0.4
        assert precision_at_k([], {"a"}, 5) == 0.0

    def test_ndcg_rewards_relevant_items_first(self) -> None:
        relevant = {"a", "b"}
        assert ndcg_at_k(["a", "b", "x"], relevant, 10) == 1.0
        late = ndcg_at_k(["x", "y", "a", "b"], relevant, 10)
        expected = (1 / math.log2(4) + 1 / math.log2(5)) / (1 + 1 / math.log2(3))
        assert late == pytest.approx(expected)
        assert ndcg_at_k(["x"], set(), 10) == 0.0

    def test_violations_distinct_and_max_precision(self) -> None:
        assert violations_at_k(["a", "b", "c"], {"b", "z"}, 5) == 1
        assert distinct_at_k(["a", "b", "c"], {"a": "quaker", "b": "quaker"}, 5) == 2
        assert max_precision_at_k(3, 5) == 0.6
        assert max_precision_at_k(12, 5) == 1.0


class TestRelevanceRules:
    product: ClassVar[dict[str, Any]] = {
        "allergens": [],
        "traces": ["gluten"],
        "nutriscoreGrade": "a",
        "novaGroup": None,
        "highInSeals": ["sugars"],
        "diets": {"vegan": None},
    }

    def test_traces_make_a_product_unsafe_for_gluten(self) -> None:
        assert not satisfies(self.product, {"noAllergen": ["gluten"]})
        assert satisfies(self.product, {"noAllergen": ["milk"], "nutriscoreIn": ["a", "b"]})

    def test_unknown_values_follow_the_documented_rule(self) -> None:
        assert not satisfies(self.product, {"dietTrue": "vegan"})
        assert satisfies(self.product, {"dietNotFalse": "vegan"})
        assert not satisfies(self.product, {"novaIn": [1, 2]})
        assert satisfies(self.product, {"novaNotIn": [4]})
        assert not satisfies(self.product, {"maxSeals": 0})


@pytest.fixture(scope="module")
def summary() -> Summary:
    return evaluate(EVALUATION_DIR)


class TestAdaptiveEvaluation:
    def test_every_persona_query_has_candidates(self, summary: Summary) -> None:
        assert len(summary.cases) == 12
        assert len(summary.scored) == 12

    def test_personalization_beats_the_non_adaptive_baseline(self, summary: Summary) -> None:
        baseline = summary.mean_precision("baseline")
        adaptive = summary.mean_precision("adaptive")
        assert adaptive >= MIN_PRECISION_LIFT * baseline, (baseline, adaptive)
        assert summary.mean_ndcg("adaptive") > summary.mean_ndcg("baseline")

    def test_personalization_never_violates_hard_constraints(self, summary: Summary) -> None:
        assert summary.total_violations("declared") == 0
        assert summary.total_violations("adaptive") == 0
        # Sin perfil, la versión base sí recomienda gluten a Camila o sellos a Jorge.
        assert summary.total_violations("baseline") > 0

    def test_learning_from_behavior_does_not_hurt(self, summary: Summary) -> None:
        assert summary.mean_ndcg("adaptive") >= summary.mean_ndcg("declared")
        for persona in ("camila", "jorge", "valentina", "explorador"):
            assert summary.mean_precision("adaptive", persona) >= summary.mean_precision(
                "declared", persona
            )

    def test_learning_curve_improves_with_interactions(self) -> None:
        curve = learning_curve(EVALUATION_DIR, "explorador", [0, 4, 8])
        ndcg = [point[2] for point in curve]
        assert ndcg[-1] > ndcg[0]
        assert ndcg == sorted(ndcg)
