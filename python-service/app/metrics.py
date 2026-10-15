"""Métricas básicas en memoria: conteo, errores y latencias por ruta."""

import math
import time
from collections import defaultdict, deque
from datetime import UTC, datetime
from threading import Lock
from typing import Any


def _p95(values: list[float]) -> float:
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(0.95 * len(ordered)) - 1)], 2) if ordered else 0.0


class MetricsRegistry:
    """Ventana deslizante de latencias por ruta (p. ej. `POST /v1/recommendations/rank`).

    También registra cada llamada a fuentes externas (Open Food Facts): resultado,
    latencia y último error, para detectar indisponibilidad o degradación de la fuente.
    """

    def __init__(self, window: int = 500) -> None:
        self._window = window
        self._lock = Lock()
        self._durations: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=self._window))
        self._counts: dict[str, int] = defaultdict(int)
        self._errors: dict[str, int] = defaultdict(int)
        self._upstream_durations: dict[str, deque[float]] = defaultdict(
            lambda: deque(maxlen=self._window)
        )
        self._upstream_outcomes: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._upstream_last_error: dict[str, dict[str, Any]] = {}
        self.started_at = time.time()

    def observe_upstream(
        self, source: str, outcome: str, duration_ms: float, detail: str | None = None
    ) -> None:
        """`outcome`: ok | timeout | network | http_<status> | invalid."""
        with self._lock:
            self._upstream_outcomes[source][outcome] += 1
            self._upstream_durations[source].append(duration_ms)
            if outcome != "ok":
                self._upstream_last_error[source] = {
                    "outcome": outcome,
                    "detail": detail,
                    "at": datetime.now(UTC).isoformat(),
                }

    def observe(self, route: str, status_code: int, duration_ms: float) -> None:
        with self._lock:
            self._counts[route] += 1
            if status_code >= 500:
                self._errors[route] += 1
            self._durations[route].append(duration_ms)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            routes = {}
            for route, count in sorted(self._counts.items()):
                durations = sorted(self._durations[route])
                p95_index = max(0, math.ceil(0.95 * len(durations)) - 1)
                routes[route] = {
                    "count": count,
                    "errors5xx": self._errors[route],
                    "avgMs": round(sum(durations) / len(durations), 2) if durations else 0.0,
                    "p95Ms": round(durations[p95_index], 2) if durations else 0.0,
                }
            upstream = {}
            for source, outcomes in sorted(self._upstream_outcomes.items()):
                total = sum(outcomes.values())
                failures = total - outcomes.get("ok", 0)
                durations = list(self._upstream_durations[source])
                upstream[source] = {
                    "requests": total,
                    "errors": failures,
                    "errorRate": round(failures / total, 3) if total else 0.0,
                    "outcomes": dict(outcomes),
                    "avgMs": round(sum(durations) / len(durations), 2) if durations else 0.0,
                    "p95Ms": _p95(durations),
                    "lastError": self._upstream_last_error.get(source),
                }
            return {
                "uptimeSeconds": round(time.time() - self.started_at, 1),
                "routes": routes,
                "upstream": upstream,
            }

    def reset(self) -> None:
        with self._lock:
            self._durations.clear()
            self._counts.clear()
            self._errors.clear()
            self._upstream_durations.clear()
            self._upstream_outcomes.clear()
            self._upstream_last_error.clear()


metrics = MetricsRegistry()
