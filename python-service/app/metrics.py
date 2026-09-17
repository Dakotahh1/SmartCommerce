"""Métricas básicas en memoria: conteo, errores y latencias por ruta."""

import math
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Any


class MetricsRegistry:
    """Ventana deslizante de latencias por ruta (p. ej. `POST /v1/recommendations/rank`)."""

    def __init__(self, window: int = 500) -> None:
        self._window = window
        self._lock = Lock()
        self._durations: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=self._window))
        self._counts: dict[str, int] = defaultdict(int)
        self._errors: dict[str, int] = defaultdict(int)
        self.started_at = time.time()

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
            return {"uptimeSeconds": round(time.time() - self.started_at, 1), "routes": routes}

    def reset(self) -> None:
        with self._lock:
            self._durations.clear()
            self._counts.clear()
            self._errors.clear()


metrics = MetricsRegistry()
