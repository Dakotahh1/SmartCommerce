from typing import Any

import pytest
from app.engine.comparison import compare
from app.engine.criteria import build_price_context, evaluate, price_value
from app.engine.learning import MAX_ADJUSTMENT, decay, learn_profile
from app.engine.ranking import BASELINE_WEIGHTS, rank
from app.schemas.engine import CompareRequest, HistoryEvent, Profile, RankRequest, Weights

from tests.conftest import candidate


def history(event_type: str, age_days: float = 0.0, **product: Any) -> HistoryEvent:
    return HistoryEvent.model_validate(
        {"type": event_type, "age_days": age_days, "product": candidate(**product)}
    )


class TestCriteria:
    def test_missing_data_is_not_invented(self) -> None:
        product = candidate(
            nutriscore_grade=None,
            nutriments=None,
            nova_group=None,
            ecoscore_grade=None,
            stores=[],
            unit_price=None,
        )
        values = evaluate(product, build_price_context([product]))
        assert values == dict.fromkeys(values, None)

    def test_nutrition_falls_back_to_seals_when_no_nutriscore(self) -> None:
        product = candidate(nutriscore_grade=None, high_in_seals=["sugars", "calories"])
        assert evaluate(product, build_price_context([]))["nutrition"] == pytest.approx(0.5)

    def test_price_relative_to_category_median(self) -> None:
        cheap = candidate(gtin="7802000014130", unit_price=2000)
        mid = candidate(gtin="7804000001431", unit_price=3000)
        expensive = candidate(gtin="3017620422003", unit_price=4000)
        ctx = build_price_context([cheap, mid, expensive])
        assert price_value(cheap, ctx) == pytest.approx(0.6667, abs=1e-3)
        assert price_value(mid, ctx) == pytest.approx(0.5)
        assert price_value(expensive, ctx) == pytest.approx(0.3333, abs=1e-3)

    def test_single_price_is_neutral(self) -> None:
        product = candidate(unit_price=1000)
        assert price_value(product, build_price_context([product])) == 0.5

    def test_preferred_store_boosts_availability(self) -> None:
        product = candidate(stores=["tottus"])
        ctx = build_price_context([])
        assert evaluate(product, ctx)["availability"] == pytest.approx(0.2)
        assert evaluate(product, ctx, ["tottus"])["availability"] == pytest.approx(0.9)


class TestRanking:
    def test_filters_exclude_by_allergen_diet_and_seals(self) -> None:
        profile = Profile(
            excluded_allergens=["milk"], diets=["gluten_free", "vegan"], avoid_high_in=True
        )
        products = [
            candidate(gtin="7802000014130", allergens=["gluten"]),
            candidate(gtin="7804000001431", allergens=["milk"], diets={"vegan": False}),
            candidate(gtin="3017620422003", allergens=[], high_in_seals=["sugars"]),
            candidate(gtin="96385074", allergens=[], diets={"vegan": True, "gluten_free": True}),
        ]
        response = rank(RankRequest(profile=profile, candidates=products))

        excluded = {item.gtin: item.reasons for item in response.excluded}
        assert excluded["7802000014130"] == ["Contiene gluten"]
        assert excluded["7804000001431"] == ["Contiene leche", "No es apto para dieta vegana"]
        assert excluded["3017620422003"] == ["Tiene sellos ALTO EN: azúcares"]
        assert [item.gtin for item in response.items] == ["96385074"]
        assert response.stats.excluded == 3

    def test_unverified_diet_generates_warning_not_exclusion(self) -> None:
        response = rank(
            RankRequest(profile=Profile(diets=["vegan"]), candidates=[candidate(allergens=[])])
        )
        assert response.items[0].warnings == ["Aptitud vegana no verificada"]

    def test_weights_change_the_winner(self) -> None:
        healthy = candidate(gtin="7802000014130", brand="A", nutriscore_grade="a", unit_price=5000)
        cheap = candidate(gtin="7804000001431", brand="B", nutriscore_grade="e", unit_price=1000)
        products = [healthy, cheap]

        health_first = Profile(
            weights=Weights(nutrition=100, price=0, processing=0, environment=0, availability=0)
        )
        price_first = Profile(
            weights=Weights(nutrition=0, price=100, processing=0, environment=0, availability=0)
        )

        assert (
            rank(RankRequest(profile=health_first, candidates=products)).items[0].gtin
            == healthy.gtin
        )
        assert (
            rank(RankRequest(profile=price_first, candidates=products)).items[0].gtin == cheap.gtin
        )

    def test_score_breakdown_is_consistent(self) -> None:
        response = rank(RankRequest(profile=Profile(), candidates=[candidate(unit_price=None)]))
        item = response.items[0]

        assert item.coverage == pytest.approx(0.75)
        assert sum(detail.contribution for detail in item.breakdown) == pytest.approx(
            item.score, abs=0.3
        )
        price = next(d for d in item.breakdown if d.criterion == "price")
        assert (price.value, price.contribution) == (None, 0.0)
        assert "Precio no disponible" in item.warnings

    def test_incomplete_products_are_penalized(self) -> None:
        stores = ["lider", "jumbo", "unimarc", "tottus", "santa-isabel"]
        complete = candidate(gtin="7802000014130", brand="A", stores=stores, unit_price=None)
        partial = candidate(
            gtin="7804000001431", brand="B", ecoscore_grade=None, stores=[], unit_price=None
        )
        response = rank(RankRequest(profile=Profile(), candidates=[partial, complete]))
        assert [item.gtin for item in response.items] == [complete.gtin, partial.gtin]

    def test_reasons_explain_the_score(self) -> None:
        response = rank(
            RankRequest(profile=Profile(), candidates=[candidate(stores=[], unit_price=None)])
        )
        reasons = response.items[0].reasons
        assert "NOVA 1: sin procesar o mínimamente procesado" in reasons
        assert "Nutri-Score B" in reasons
        assert "Sin sellos ALTO EN" in reasons

    def test_price_reason_mentions_percentage(self) -> None:
        products = [
            candidate(gtin="7802000014130", brand="A", unit_price=2000),
            candidate(gtin="7804000001431", brand="B", unit_price=3000),
            candidate(gtin="3017620422003", brand="C", unit_price=4000),
        ]
        profile = Profile(
            weights=Weights(nutrition=0, price=100, processing=0, environment=0, availability=0)
        )
        top = rank(RankRequest(profile=profile, candidates=products)).items[0]
        assert "33% más barato por kg que la mediana" in top.reasons

    def test_baseline_ignores_profile_and_is_identical_for_everyone(self) -> None:
        products = [
            candidate(gtin="7802000014130", allergens=["gluten"]),
            candidate(gtin="7804000001431"),
        ]
        a = rank(
            RankRequest(
                strategy="baseline",
                profile=Profile(excluded_allergens=["gluten"]),
                candidates=products,
            )
        )
        b = rank(RankRequest(strategy="baseline", profile=None, candidates=products))

        assert a.strategy == b.strategy == "baseline"
        assert a.weights_used == BASELINE_WEIGHTS
        assert [i.gtin for i in a.items] == [i.gtin for i in b.items]
        assert a.excluded == []

    def test_diversification_limits_brand_repetition(self) -> None:
        products = [
            candidate(gtin="7802000014130", brand="Quaker", nutriscore_grade="a"),
            candidate(gtin="7804000001431", brand="Quaker", nutriscore_grade="a"),
            candidate(
                gtin="3017620422003", brand="Vivo", nutriscore_grade="a", data_quality_score=0.5
            ),
        ]
        ranked = rank(RankRequest(profile=Profile(), candidates=products, limit=3)).items
        plain = rank(
            RankRequest(profile=Profile(), candidates=products, limit=3, diversify=False)
        ).items

        assert [i.gtin for i in plain] == ["7802000014130", "7804000001431", "3017620422003"]
        assert [i.gtin for i in ranked][:2] == ["7802000014130", "3017620422003"]

    def test_limit_and_stats(self) -> None:
        products = [
            candidate(gtin=g, brand=g) for g in ("7802000014130", "7804000001431", "3017620422003")
        ]
        response = rank(RankRequest(profile=Profile(), candidates=products, limit=2))
        assert len(response.items) == 2
        assert [i.rank for i in response.items] == [1, 2]
        assert response.stats.candidates == 3

    def test_affinity_from_history_boosts_brand(self) -> None:
        products = [
            candidate(gtin="7802000014130", brand="Quaker", main_category="oats"),
            candidate(gtin="7804000001431", brand="Vivo", main_category="oats"),
        ]
        events = [
            history("favorite", brand="Vivo", main_category="oats", gtin="96385074")
            for _ in range(3)
        ]
        response = rank(
            RankRequest(profile=Profile(), candidates=products, history=events, diversify=False)
        )
        assert response.items[0].gtin == "7804000001431"
        assert "Similar a productos que te interesaron" in response.items[0].reasons


class TestLearning:
    def test_decay_half_life(self) -> None:
        assert decay(0) == 1.0
        assert decay(14) == pytest.approx(0.5)

    def test_positive_interactions_raise_weight_of_strong_criteria(self) -> None:
        events = [
            history(
                "favorite",
                nutriscore_grade="a",
                nova_group=4,
                ecoscore_grade="e",
                stores=[],
                unit_price=None,
            )
        ]
        learned = learn_profile(Weights(), events, build_price_context([]))

        assert learned.adjustments["nutrition"] > 0
        assert learned.adjustments["processing"] < 0
        assert learned.effective_weights["nutrition"] > 30
        assert learned.events_used == 1
        assert any(line.startswith("Nutrición +") for line in learned.explanations())

    def test_adjustments_are_bounded(self) -> None:
        events = [
            history("favorite", nutriscore_grade="a", nova_group=4, ecoscore_grade="e")
            for _ in range(200)
        ]
        learned = learn_profile(Weights(nutrition=95), events, build_price_context([]))
        assert max(abs(v) for v in learned.adjustments.values()) <= MAX_ADJUSTMENT
        assert learned.effective_weights["nutrition"] == 100.0

    def test_old_and_negative_events(self) -> None:
        recent = learn_profile(
            Weights(),
            [history("dismiss", 0, nutriscore_grade="a", nova_group=4)],
            build_price_context([]),
        )
        old = learn_profile(
            Weights(),
            [history("dismiss", 140, nutriscore_grade="a", nova_group=4)],
            build_price_context([]),
        )
        assert recent.adjustments["nutrition"] < 0
        assert abs(old.adjustments["nutrition"]) < abs(recent.adjustments["nutrition"])
        assert recent.brand_affinity["quaker"] < 0


class TestComparison:
    def test_winner_criteria_and_summary(self) -> None:
        quaker = candidate(
            gtin="7802000014130", name="Avena Quaker", brand="Quaker", nova_group=1, unit_price=3557
        )
        enlinea = candidate(
            gtin="7804000001431",
            name="Hojuelas Enlinea",
            brand="Enlinea",
            nutriscore_grade="a",
            nova_group=4,
            unit_price=7545,
        )
        response = compare(CompareRequest(profile=Profile(), products=[enlinea, quaker]))

        assert response.winner_gtin == quaker.gtin
        assert response.items[0].gtin == quaker.gtin
        assert response.criteria_winners["nutrition"] == [enlinea.gtin]
        assert quaker.gtin in response.criteria_winners["processing"]
        assert response.summary.startswith("Avena Quaker es la mejor opción para ti")
        assert "Hojuelas Enlinea es mejor en nutrición" in response.summary

    def test_ineligible_products_are_listed_last(self) -> None:
        profile = Profile(excluded_allergens=["gluten"])
        response = compare(
            CompareRequest(
                profile=profile,
                products=[
                    candidate(gtin="7802000014130", allergens=["gluten"], nutriscore_grade="a"),
                    candidate(gtin="7804000001431", allergens=[]),
                ],
            )
        )
        assert response.winner_gtin == "7804000001431"
        assert (response.items[-1].eligible, response.items[-1].exclusion_reasons) == (
            False,
            ["Contiene gluten"],
        )

    def test_no_eligible_products(self) -> None:
        profile = Profile(excluded_allergens=["gluten"])
        products = [candidate(gtin="7802000014130"), candidate(gtin="7804000001431")]
        response = compare(CompareRequest(profile=profile, products=products))
        assert response.winner_gtin is None
        assert response.summary.startswith("Ningún producto cumple")
