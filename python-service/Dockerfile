# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────────────────────
# Servicio SmartMatch (Python 3.13 + FastAPI)
# Etapa 1: dependencias reproducibles con uv (lockfile congelado, sin dev).
# Etapa 2: runtime mínimo, usuario sin privilegios y healthcheck.
# ──────────────────────────────────────────────────────────────────────────────
ARG PYTHON_IMAGE=python:3.13.15-slim-trixie

FROM astral/uv:0.12.16 AS uv

FROM ${PYTHON_IMAGE} AS builder
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project
COPY app ./app

FROM ${PYTHON_IMAGE} AS runtime
LABEL org.opencontainers.image.title="smartcommerce-python-service" \
      org.opencontainers.image.description="Ingesta Open Food Facts y motor SmartMatch" \
      org.opencontainers.image.licenses="MIT"
# Parches de seguridad publicados después de la imagen base y sin pip en runtime: la app usa el
# venv copiado desde builder y pip trae dependencias vendorizadas que solo amplían la superficie.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* \
 && python -m pip uninstall --yes pip \
 && groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=builder --chown=root:root /app/.venv /app/.venv
COPY --from=builder --chown=root:root /app/app /app/app
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    PORT=8000
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header", "--timeout-graceful-shutdown", "10"]
