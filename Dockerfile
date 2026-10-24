# syntax=docker/dockerfile:1
#
# DORA — production image (Next.js standalone server + Prisma migrations).
# Build:  docker build -t dora .
# Run:    docker run -e DATABASE_URL=postgresql://… -p 3000:3000 dora
# The container applies pending migrations (`prisma migrate deploy`) and only then starts the
# server; see docker/entrypoint.sh and RAILWAY_DEPLOYMENT.md. No PostgreSQL inside the image.

ARG NODE_IMAGE=node:24.22.1-bookworm-slim

# ── base: Node.js LTS (matches .nvmrc / engines) + OpenSSL for the Prisma schema engine ─────
FROM ${NODE_IMAGE} AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# ── deps: all dependencies from the lockfile (postinstall runs `prisma generate`) ───────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── builder: Prisma Client + Next.js standalone build (no database needed, none contacted) ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `public/` is empty and therefore not in git; the runner copies it.
RUN mkdir -p public
ENV NODE_ENV=production \
    NEXT_OUTPUT=standalone
RUN npm run build

# ── migrator: Prisma CLI (same version as the lockfile) + schema, migrations and config ─────
FROM base AS migrator
WORKDIR /opt/migrate
COPY --from=deps /app/node_modules/prisma/package.json /tmp/prisma-package.json
RUN npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund \
       "prisma@$(node -p "require('/tmp/prisma-package.json').version")" \
  && npm cache clean --force
COPY prisma.config.ts ./
COPY prisma ./prisma

# ── runner: minimal production image, non-root ───────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# Standalone server with traced node_modules (incl. Prisma Client, pdfkit) and assets/fonts.
COPY --from=builder --chown=node:node /app/.next.nosync/standalone ./
COPY --from=builder --chown=node:node /app/.next.nosync/static ./.next.nosync/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=migrator /opt/migrate ./migrate
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/dora-entrypoint
USER node
EXPOSE 3000
CMD ["dora-entrypoint"]
