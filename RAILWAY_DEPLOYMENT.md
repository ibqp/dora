# Deploying DORA to Railway (manual)

This guide deploys the DORA Docker image to [Railway](https://railway.com) with a Railway
PostgreSQL database. All steps are performed by you in the Railway dashboard; nothing in this
repository deploys automatically.

> **Status:** the Docker image has been built and tested locally (linux/arm64 natively,
> linux/amd64 under emulation) against PostgreSQL 17 in Docker Compose. A real Railway
> deployment has **not** been performed or verified.

## How the container works

| Aspect | Behaviour |
| --- | --- |
| Build | `Dockerfile` (multi-stage): `npm ci` → `prisma generate` → `next build` (standalone output). No database is contacted during the build. |
| Start | `docker/entrypoint.sh`: checks `DATABASE_URL` → runs `prisma migrate deploy` → starts `node server.js`. |
| Migrations | Applied on every container start, **before** the server listens. Already applied migrations are skipped. If a migration fails or the database is unreachable, the container exits (non-zero) and never serves requests. Data is never reset or seeded. |
| Port / host | Listens on `0.0.0.0:$PORT` (Railway injects `PORT`; default 3000). |
| User | Runs as the non-root `node` user. |
| Health check | `GET /api/health` → `200 {"status":"ok","database":"ok"}` (503 if PostgreSQL is unavailable). |
| PDF export | Rendered in the container with PDFKit and the embedded Geist fonts; no browser or system fonts needed. |
| Secrets | None in the image; `.env` files are excluded by `.dockerignore`. |

Why migrations run in the container start command: this is a single-instance educational MVP.
Running `prisma migrate deploy` right before `node server.js` guarantees the schema is current
whenever the server accepts traffic, and Railway's health check only routes traffic to the new
deployment once `/api/health` answers — which happens after the migrations. (With several
replicas, use the pre-deploy alternative below so migrations run exactly once.)

## Local Docker Compose vs. Railway

| | Local (`compose.yaml`) | Railway (production) |
| --- | --- | --- |
| How it runs | `docker compose up --build` on your machine | Railway builds the `Dockerfile` from your GitHub repository |
| PostgreSQL | `postgres:17-alpine` container + `dora-db` volume | Railway PostgreSQL service (managed volume) |
| `DATABASE_URL` | Fixed in `compose.yaml` (throwaway local credentials) | Reference variable `${{Postgres.DATABASE_URL}}` |
| `PORT` | 3000 inside the container, host port `DORA_PORT` (default 3000) | Injected by Railway |
| Domain | `http://localhost:3000` | Railway-generated `*.up.railway.app` domain (or your own) |
| Compose file | Used | **Not used** — Railway does not read `compose.yaml` |

## Prerequisites

- The repository is on GitHub and contains everything the build needs, committed:
  `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `prisma/` (schema and **all**
  migrations), `assets/fonts/geist/`, `package-lock.json`, and the application source.
  Files that exist only locally (uncommitted) are not part of Railway's build.
- A Railway account.

## 1. Create a Railway project

1. Railway dashboard → **New Project** → **Empty Project**.
2. Name it, e.g. `dora`.

## 2. Provision PostgreSQL

1. In the project: **Create** (or **+ New**) → **Database** → **Add PostgreSQL**.
2. Wait until the service is running. Railway creates its volume and the variables
   (`DATABASE_URL`, `PGHOST`, …) on that service. No manual schema setup is needed — the DORA
   container applies the migrations.

## 3. Create the DORA application service

1. **Create** → **GitHub Repo** → select the DORA repository (authorise Railway for GitHub if
   asked).
2. Railway detects the `Dockerfile` in the repository root and builds with it. To make it
   explicit: service → **Settings** → **Build** → Builder **Dockerfile**, Dockerfile path
   `Dockerfile`.
3. Root directory: repository root (leave empty). No custom build or start command is needed —
   the Dockerfile defines both. Leave **Custom Start Command** empty (it would replace the
   entrypoint and skip the migrations).

## 4. Configure variables

Service **DORA** → **Variables**:

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Required. Use **Add Reference** → PostgreSQL service → `DATABASE_URL`. Replace `Postgres` with the actual name of your database service if you renamed it. This is the private-network URL (`postgres.railway.internal`); no SSL setting is needed on the private network. |
| `PORT` | — | Do not set; Railway injects it. |
| `RUN_MIGRATIONS` | — | Optional, default `true`. Set to `false` only when using the pre-deploy alternative below. |

No other variables are required. Do **not** set `HOSTNAME` (the entrypoint pins it to `0.0.0.0`).
There are no AI/API keys.

## 5. Deploy

1. Saving the variables triggers a deployment (or use **Deploy** on the service).
2. Build logs should show the stages `deps`, `builder` (`prisma generate`, `next build`),
   `migrator` and `runner`. A first build takes a few minutes.

## 6. Networking and public domain

1. Service → **Settings** → **Networking** → **Public Networking** → **Generate Domain**.
2. If Railway asks for the target port, enter the port shown in the deploy logs
   (`[dora] Starting server on 0.0.0.0:<PORT>`), normally Railway's injected `PORT` value
   (commonly `8080`).
3. Optional: add a custom domain in the same section and create the DNS record Railway shows.

## 7. Health check (recommended)

Service → **Settings** → **Deploy** → **Healthcheck Path**: `/api/health`.
Railway then switches traffic to a new deployment only after it reports healthy (migrations
completed, server running, database reachable). Keep the default healthcheck timeout (300 s) or
higher; migrations normally take seconds.

Restart policy: the default (restart on failure) is fine — a container that cannot reach the
database exits and is retried.

## 8. Verify migrations

Open the deployment → **Deploy Logs**. A first deployment shows:

```
[dora] Applying database migrations (prisma migrate deploy)...
4 migrations found in prisma/migrations
Applying migration `20261023181452_init`
...
All migrations have been successfully applied.
[dora] Migrations applied.
[dora] Starting server on 0.0.0.0:8080
```

Later deployments show `No pending migrations to apply.` (or apply only the new ones).

Optionally inspect the database: PostgreSQL service → **Database** → **Data**: tables
`ChatSession`, `Message`, `RequirementState`, `BusinessRequirementsDocument`, `AppSettings`
(one row) and `_prisma_migrations` (one row per migration). No sessions or BRDs exist until you
create them — there is no demo data.

## 9. Verify application startup

1. `https://<your-domain>/api/health` → `{"status":"ok","database":"ok"}`
2. `https://<your-domain>/api/settings` → default role and 1500 ms delay.
3. Open `https://<your-domain>/` → New Discovery. Run a short smoke test:
   send "I need a customer churn dashboard." (DORA asks about the business problem) →
   answer once → **Generate BRD** → draft → edit a field → **Save Changes** → **Export PDF**.

## 10. Logs and troubleshooting

Logs: service → **Deployments** → select a deployment → **Build Logs** / **Deploy Logs**
(also **Observability** → Logs).

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `[dora] DATABASE_URL is not set` and the container exits | Variable missing on the DORA service | Add `DATABASE_URL=${{Postgres.DATABASE_URL}}` (step 4). |
| `P1001: Can't reach database server` | Wrong reference / database service not running / typo in service name | Check the PostgreSQL service is up and the reference variable resolves (Variables tab shows the resolved value on hover). |
| `P1000: Authentication failed` | Hand-copied URL with old credentials | Use the reference variable instead of a copied value. |
| `P3009` / `P3018` (failed migration) | A migration failed half-way | Read the error; fix the cause, then resolve it with `prisma migrate resolve` from a machine with access (see Prisma docs). Do **not** reset the production database. |
| Healthcheck fails, logs show the server started | Domain target port differs from the listening port | Set the domain's target port to the port in `Starting server on 0.0.0.0:<PORT>`. |
| `Application failed to respond` on the domain | Deployment still starting or crashed | Check Deploy Logs; wait for `Starting server`. |
| API returns `503 DATABASE_UNAVAILABLE` | Database restarting or unreachable at runtime | Check the PostgreSQL service; the app recovers automatically. |
| Build fails at `COPY ... assets` / missing migration | Files not committed to GitHub | Commit them and redeploy. |
| Build fails in `npm ci` | `package-lock.json` out of sync with `package.json` | Run `npm install` locally, commit the lockfile. |

## 11. Redeploy updated versions

1. Commit and push to the branch connected to the service (default: `main`). Railway builds
   and deploys automatically (toggle under **Settings** → **Source**), or use **Redeploy** on a
   deployment.
2. New migrations in `prisma/migrations` are applied by the new container before it serves
   traffic; with the health check configured, the previous deployment keeps serving until then.
3. Never edit or delete migrations that were already deployed — add a new migration instead.
4. Rollback: **Deployments** → previous deployment → **Redeploy**. Note that database
   migrations are not rolled back automatically.

## 12. Verify data persistence after redeployment

1. Before redeploying, create a discovery session (and a BRD) and note its title.
2. Redeploy (step 11).
3. After the new deployment is healthy, reload the app: the session, its messages, progress and
   BRD are still there; Deploy Logs show `No pending migrations to apply.`

Data lives in the PostgreSQL service's volume, not in the DORA container, so redeploying or
restarting DORA never affects it. Deleting the PostgreSQL service (or its volume) deletes the data.

## Alternative: migrations as a Railway pre-deploy step

If you prefer migrations outside the start command (e.g. before scaling to several replicas):

1. DORA service → **Settings** → **Deploy** → **Pre-deploy Command**:
   `sh -c "cd /app/migrate && node node_modules/prisma/build/index.js migrate deploy"`
2. Add the variable `RUN_MIGRATIONS=false` so the start command skips them.

Railway runs the pre-deploy command in the new image before starting it; if it fails, the
deployment is aborted and the previous one keeps running.

## Building and testing the image locally first

```bash
docker build -t dora .                     # same Dockerfile Railway uses
docker compose up --build                  # app + PostgreSQL 17 on http://localhost:3000
docker compose down                        # stop, keep data (add -v to delete the volume)
```
