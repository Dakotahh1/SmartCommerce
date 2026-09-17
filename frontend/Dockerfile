# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────────────────────
# Frontend SmartCommerce (Angular 22 + Ionic 9) servido por Nginx sin privilegios
#   deps    → dependencias exactas del lockfile
#   build   → build de producción (PWA con service worker)
#   runtime → Nginx unprivileged: SPA + proxy /api → NestJS + cabeceras de seguridad
# ──────────────────────────────────────────────────────────────────────────────
ARG NODE_IMAGE=node:24.21.0-alpine3.22
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.5-alpine3.24

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS build
COPY angular.json tsconfig.json tsconfig.app.json ngsw-config.json ./
COPY public ./public
COPY src ./src
RUN npx ng build --configuration production

FROM ${NGINX_IMAGE} AS runtime
LABEL org.opencontainers.image.title="smartcommerce-frontend" \
      org.opencontainers.image.description="PWA SmartCommerce (Angular + Ionic) y gateway hacia la API" \
      org.opencontainers.image.licenses="MIT"
ENV API_UPSTREAM=http://backend:3000 \
    DNS_RESOLVER=127.0.0.11 \
    NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --chown=root:root nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chown=root:root nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build --chown=root:root /app/dist/frontend/browser /usr/share/nginx/html
# Usuario nginx (uid 101): los archivos servidos son de solo lectura para el proceso.
USER 101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
