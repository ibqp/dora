#!/bin/sh
# Container start: apply pending Prisma migrations, then start the Next.js server.
# The server starts only after `prisma migrate deploy` succeeded; if it fails (database
# unreachable, failed migration) the container exits non-zero and serves nothing.
# Never resets or seeds data. Set RUN_MIGRATIONS=false to skip (e.g. when migrations run in a
# separate pre-deploy step).
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[dora] DATABASE_URL is not set. Configure the PostgreSQL connection string." >&2
  exit 1
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[dora] Applying database migrations (prisma migrate deploy)..."
  (cd /app/migrate && node node_modules/prisma/build/index.js migrate deploy)
  echo "[dora] Migrations applied."
else
  echo "[dora] RUN_MIGRATIONS=false: skipping migrations."
fi

# Next.js standalone binds to $HOSTNAME. Platforms may set HOSTNAME to the container name at
# runtime, so it is pinned here: listen on all interfaces, on the platform-provided $PORT.
export HOSTNAME=0.0.0.0
export PORT="${PORT:-3000}"
echo "[dora] Starting server on ${HOSTNAME}:${PORT}"
exec node server.js
