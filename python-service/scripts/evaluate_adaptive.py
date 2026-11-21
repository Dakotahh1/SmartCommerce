"""Ejecuta la evaluación del motor adaptativo y publica los resultados.

Escribe `evaluation/adaptive/results.json` (reproducible: no incluye fechas) e imprime un reporte en
Markdown; con `--summary <archivo>` lo agrega además a ese archivo (el pipeline usa
$GITHUB_STEP_SUMMARY para dejarlo en el resumen del job).

Uso (desde python-service/):  uv run python scripts/evaluate_adaptive.py [--summary archivo]
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.evaluation.adaptive import STRATEGIES, Summary, evaluate, learning_curve  # noqa: E402

EVALUATION_DIR = ROOT.parent / "evaluation" / "adaptive"
LABELS = {
    "baseline": "Base no adaptativa",
    "declared": "Perfil declarado",
    "adaptive": "Adaptativa",
}
CURVE_STEPS = (0, 2, 4, 6, 8)


def lift(summary: Summary, metric: str) -> float:
    base = getattr(summary, metric)("baseline")
    return round(100 * (getattr(summary, metric)("adaptive") - base) / base, 1) if base else 0.0


def report(summary: Summary, curve: list[tuple[int, float, float]]) -> str:
    lines = [
        "### Evaluación del motor adaptativo (SmartMatch)",
        "",
        f"{len(summary.cases)} casos (persona × categoría) sobre productos reales de "
        "Open Food Facts Chile.",
        "",
        "| Estrategia | P@5 | nDCG@10 | Violaciones@5 | Marcas distintas@5 |",
        "|---|---|---|---|---|",
    ]
    for strategy in STRATEGIES:
        lines.append(
            f"| {LABELS[strategy]} | {summary.mean_precision(strategy):.3f} "
            f"| {summary.mean_ndcg(strategy):.3f} | {summary.total_violations(strategy)} "
            f"| {summary.mean_brands(strategy):.2f} |"
        )
    lines += [
        "",
        f"Mejora de la adaptativa sobre la base: P@5 **{lift(summary, 'mean_precision'):+.1f} %**,"
        f" nDCG@10 **{lift(summary, 'mean_ndcg'):+.1f} %**. "
        f"P@5 máximo alcanzable: {summary.mean_max_precision():.3f}.",
        "",
        "| Persona | Categoría | Relevantes | P@5 base → adaptativa | nDCG@10 base → adaptativa "
        "| Violaciones@5 base → adaptativa |",
        "|---|---|---|---|---|---|",
    ]
    for case in summary.cases:
        lines.append(
            f"| {case.persona} | {case.query} | {case.relevant} "
            f"| {case.precision['baseline']:.2f} → {case.precision['adaptive']:.2f} "
            f"| {case.ndcg['baseline']:.2f} → {case.ndcg['adaptive']:.2f} "
            f"| {case.violations['baseline']} → {case.violations['adaptive']} |"
        )
    lines += [
        "",
        "Aprendizaje solo por comportamiento (usuario nuevo, nDCG@10 según interacciones): "
        + " · ".join(f"{n}: {ndcg:.3f}" for n, _, ndcg in curve),
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    summary = evaluate(EVALUATION_DIR)
    curve = learning_curve(EVALUATION_DIR, "explorador", CURVE_STEPS)
    results = {
        "strategies": {
            strategy: {
                "precisionAt5": summary.mean_precision(strategy),
                "ndcgAt10": summary.mean_ndcg(strategy),
                "violationsAt5": summary.total_violations(strategy),
                "distinctBrandsAt5": summary.mean_brands(strategy),
            }
            for strategy in STRATEGIES
        },
        "liftPercent": {
            "precisionAt5": lift(summary, "mean_precision"),
            "ndcgAt10": lift(summary, "mean_ndcg"),
        },
        "maxPrecisionAt5": summary.mean_max_precision(),
        "learningCurve": [
            {"interactions": n, "precisionAt5": p, "ndcgAt10": g} for n, p, g in curve
        ],
        "cases": [
            {
                "persona": c.persona,
                "query": c.query,
                "relevant": c.relevant,
                "precisionAt5": c.precision,
                "ndcgAt10": {k: round(v, 4) for k, v in c.ndcg.items()},
                "violationsAt5": c.violations,
                "distinctBrandsAt5": c.brands,
                "top5": c.top,
            }
            for c in summary.cases
        ],
    }
    (EVALUATION_DIR / "results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n"
    )
    markdown = report(summary, curve)
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    print(markdown)
    if "--summary" in sys.argv:
        destino = Path(sys.argv[sys.argv.index("--summary") + 1])
        with destino.open("a", encoding="utf-8") as archivo:
            archivo.write(markdown)


if __name__ == "__main__":
    main()
