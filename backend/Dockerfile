# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────────────────────
# API principal SmartCommerce (NestJS 12 · Node 24 LTS)
#   deps    → dependencias exactas del lockfile (incluye dev para compilar)
#   build   → compila TypeScript
#   prod    → solo dependencias de producción
#   runtime → imagen mínima, usuario sin privilegios, healthcheck
# ──────────────────────────────────────────────────────────────────────────────
ARG NODE_IMAGE=node:24.21.0-alpine3.22

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="smartcommerce-backend" \
      org.opencontainers.image.description="API REST principal de SmartCommerce (NestJS)" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--enable-source-maps"
WORKDIR /app
# Sin npm/yarn en runtime: reduce superficie de ataque y vulnerabilidades reportadas.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn*
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --chown=root:root package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/main.js"]
