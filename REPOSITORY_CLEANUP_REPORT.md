# DORA — Repository Sanity, Dead Code Audit & Cleanup Report (Final Phase)

**Date:** 2026-10-24 · **Commit audited:** `9464e6c Phase 14` (`main`, working tree clean, up to date
with `origin/main`) · **Mode:** audit only. Nothing was deleted, changed or committed apart from
creating this report.

Verification labels: **VERIFIED** (reproduced by a command during this audit) · **STATIC** (code,
config or history inspection only).

---

## 1. Summary

The repository is already lean. 169 tracked files (133 under `src/`, ~1.9 MB, of which 0.5 MB is
`package-lock.json`). No generated files, build output, logs, conflict copies or secrets are
tracked, either now or in history. There are no TODO/FIXME markers, `@ts-ignore`, `eslint-disable`,
debug logging, commented-out implementations, demo data or feature flags left over from earlier
phases.

A fresh clone passes every reproducibility step: install, typecheck, lint, 176 unit tests, 79 DB
integration tests, production build, Docker image build, Compose start, migrations and health check
(§8).

The cleanup candidates are small:

| Class | Items |
| --- | --- |
| SAFE TO REMOVE | 3 pieces of dead code (one unused shadcn primitive, one unused constant, one unused re-export block) |
| REQUIRES REVIEW | 7 items: one dependency classification, unused barrel/type exports, an unused constant, ignore-file tweaks, one documentation gap |
| KEEP | Everything else, including 4 packages that static analysis wrongly reports as unused |

Method: imports, package scripts, config files (`next.config.ts`, `globals.css`, `prisma.config.ts`,
`vitest.config.mts`, `eslint.config.mjs`), Dockerfile stages, the entrypoint and the tests were
traced by hand. [knip](https://knip.dev) 5 was run as a cross-check in a scratch clone; it was not
added to the project. Every knip finding was checked by hand (§5 lists the false positives).

---

## 2. SAFE TO REMOVE

| # | File / symbol | Reason | Evidence | Risk | Impact | Verification required |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `src/components/ui/separator.tsx` (whole file) | shadcn/ui primitive that was added but is not used anywhere | `grep -rn "ui/separator" src` returns nothing. knip reports it as the only unused file. `select.tsx` and `dropdown-menu.tsx` define their own separators and do not import it. No dynamic imports in the project. STATIC + VERIFIED (knip) | Low | None at runtime. Can be re-added with `npx shadcn add separator` | `npm run check`, `npm run build` |
| S2 | `SCENARIO_SUBJECTS` in `src/lib/mock-ai/config/scenarios.ts:87-93` | Unused constant in the Mock AI config (the templates use `SCENARIO_LABELS`) | No reference in `src/`, `tests/` or the docs. knip reports it unused even when same-file use is counted. STATIC + VERIFIED (knip) | Low | None. The engine never reads it, so its deterministic output does not change | `npm test` (engine, template and classification tests) |
| S3 | Re-export block in `src/lib/mock-ai/progress.ts:15-20` (`calculateCompleteness`, `calculateRequirementsCompleteness`, `countCompletedFields`, `listIncompleteFields`) | Second import path for the central completeness functions. Nobody uses it | Every consumer imports these from `@/lib/requirements/progress`; `requirements/progress.test.ts` does too. The `import` on line 10 of the same file is still needed and stays. STATIC + VERIFIED (knip) | Low | None. It also stops anyone treating `mock-ai/progress` as a second home for the completeness calculation (CLAUDE.md: "the only completeness calculation") | `npm run check`, `npm test` |

---

## 3. REQUIRES REVIEW

| # | File / dependency | Proposal | Evidence | Risk | Potential impact | Verification required |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | `shadcn` (`dependencies`, `package.json:32`) | Move to `devDependencies` at the **same** version range (`^4.22.1`), with no upgrade. This is the same as SEC-08 in `SECURITY_HEALTH_AUDIT.md` | Its only use is `@import "shadcn/tailwind.css"` in `src/app/globals.css:3`, which is resolved at **build time**. The standalone runtime image does not contain it (verified in Phase 14). The Docker `deps` stage runs a plain `npm ci`, so dev dependencies stay installed for the build. Railway builds from the Dockerfile (`RAILWAY_DEPLOYMENT.md:15,65`). It is also the CLI behind `components.json` | Low | Docker/Railway: none. A non-Docker host that runs `npm ci --omit=dev` before `npm run build` would fail. That setup already fails today, because `prisma`, `tailwindcss` and `typescript` are dev dependencies too. Prisma: none | Edit `package.json`, then run `npm install --package-lock-only --no-audit --no-fund`. Check that the lockfile diff only changes `"dev": true` flags (no version changes). Then `npm ci`, `npm run build`, `docker build` |
| R2 | Unused re-exports in the `src/lib/mock-ai/index.ts` barrel: `classifyScenario`, `buildRequirementsProgress`, `getStageProgress`, `DISCOVERY_STAGE_LABELS`, `DISCOVERY_STAGE_ORDER`, `ROLE_PROFILES`, `getRoleProfile`, `SCENARIO_LABELS`, the four progress types, `EngineEvent`, `EngineInput` | **Recommend KEEP.** Optionally trim the barrel to what is used, or move consumers onto the barrel | Consumers of `@/lib/mock-ai` only use `processTurn`, `createInitialDiscoveryState`, `discoveryStateSchema`, `DiscoveryState` and `EngineResult`. Other code imports deep paths (`@/lib/mock-ai/progress` ×5, `/roles` ×3, `/state-machine`, `/state`). The barrel is documented as "Public entry points" | None at runtime | Only a convention question. Removing exports has no runtime or bundle effect | `npm run check` |
| R3 | `ASSISTANT_FULL_NAME` in `src/config/app.ts:3` | Remove it, or use it in the UI | No reference in code. The name "Discovery-Oriented Requirements Assistant" appears only in `MASTER_SPEC.md` and `README.md` text | Low | None | `npm run check` |
| R4 | Unused exported types: `CreateChatRequest`, `SendMessageRequest`, `UpdateChatRequest` (`src/lib/api/chat-schemas.ts:76,86,109`) and `RequirementFieldState` (`src/lib/requirements/schemas.ts:29`) | **Recommend KEEP**: they are the natural type companions of the schemas | No references | None (types only, erased at build) | None | — |
| R5 | `.dockerignore`: tests and docs are part of the build context | Optional: also exclude `tests/`, `**/*.test.ts`, `vitest.config.mts`, `*.md`, `scripts/`. **Recommend leaving it as is** | About 376 KB of the ~1.9 MB tracked content is docs, tests and tooling. None of it reaches the runtime image (standalone output is traced). Caveat: `next build` type-checks everything matched by `tsconfig.json`'s `**/*.ts`. Excluding `tests/` but not the `*.db.test.ts` files that import `tests/pdf-text.ts` would break the image build, so test exclusions must be all or nothing | Medium if done partially | Saves a little context transfer and avoids cache invalidation when only docs change | `docker build -t dora .`, then the Compose flow in §8 |
| R6 | `.gitignore` template boilerplate: Yarn/PnP lines (`.pnp`, `.yarn/*`), `.vercel`, `!.vscode/extensions.json` (that file does not exist) | **Recommend KEEP**: harmless and guards against accidents | npm-only project, deployed on Railway | None | Cosmetic only | `git status --ignored` unchanged |
| R7 | Documentation gap: Phase 14 (`SECURITY_HEALTH_AUDIT.md`, committed in `9464e6c`) has no entry in `IMPLEMENTATION_STATUS.md`, which the working agreement requires for every phase | Add a short Phase 14 entry and, after this phase, a cleanup entry. Keep `SECURITY_HEALTH_AUDIT.md` (decision record for the accepted risks; SEC-01 is accepted by the owner) | `grep "Phase 14\|SECURITY_HEALTH" IMPLEMENTATION_STATUS.md README.md` returns nothing | None | Documentation accuracy | Read-through |

Also for the owner, not a repository change: `SECURITY_HEALTH_AUDIT.md:90` notes a leftover local
database **`dora_phase14_audit`**. This audit did not check whether it still exists and did not
touch it.

---

## 4. KEEP — files that must remain

| Area | Files | Why |
| --- | --- | --- |
| Source | all of `src/` except S1 | Every route under `src/app/api/**` is called by `src/lib/api/client.ts`, by Compose/Railway (`/api/health`) or by tests. Every component, hook and service is imported from a page or route |
| Mock AI | `src/lib/mock-ai/**` | Required deterministic engine. Not mock data: no fake records reach production, and there is no seed |
| Vendored shadcn/ui | `src/components/ui/*` (except S1), including unused sub-exports such as `AlertDialogTrigger`, `DropdownMenuSub*` and `SelectGroup` | Upstream primitive files. Trimming them makes later `shadcn` updates harder and gains nothing (tree-shaken) |
| Exports used only inside their own file | 42 symbols (e.g. `countSpecifiedFields`, `quoted`, `ApiError`, `errorResponse`, `isUnresolved`) | Live code. Only the `export` keyword is unnecessary. Removing it would be a refactor with no value |
| Prisma | `prisma/schema.prisma`, all 4 migrations, `migration_lock.toml`, `prisma.config.ts` | Schema, history (never edit) and config for CLI, Docker `deps` and the migrator stage |
| Docker | `Dockerfile`, `compose.yaml`, `.dockerignore`, `docker/entrypoint.sh` | Build, local stack, migrations at start |
| Config | `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `components.json` (shadcn CLI), `.nvmrc` (matches `engines` and the Docker base image), `.env.example`, `.gitignore` | All referenced by scripts, tools or the build |
| Assets | `assets/fonts/geist/*.ttf`, `OFL.txt`; `src/app/favicon.ico` | The PDF route reads the fonts from disk (`outputFileTracingIncludes`); the OFL licence must ship with redistributed fonts; the favicon is the Next.js app-icon convention |
| Tests | `src/**/*.test.ts`, `src/**/*.db.test.ts`, `tests/db-global-setup.ts`, `tests/db-setup.ts`, `tests/pdf-text.ts` | Referenced by `vitest.config.mts` and the tests |
| Scripts | `scripts/clean-project.sh` | Documented iCloud conflict-copy cleanup (CLAUDE.md). Its dry run finds nothing today |
| Docs | `MASTER_SPEC.md`, `IMPLEMENTATION_STATUS.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `RAILWAY_DEPLOYMENT.md`, `SECURITY_HEALTH_AUDIT.md`, this report | Spec, status, user docs, agent rules (`AGENTS.md` is pulled into `CLAUDE.md` and re-created by `next dev`), deployment runbook, risk record |
| `package.json` scripts | all 15 | `dev`/`build`/`start`/`check`/`test*` are documented workflows. `postinstall` generates the Prisma client (needed by `npm ci` and Docker). The `db:*` scripts are developer helpers documented in the README |

Intentional runtime behaviour that is **not** a development leftover:

- The five `console.*` calls are all error reporting: `error.tsx:12`, `http.ts:68,71`,
  `discovery-service.ts:184` (lock release failure), `chat-view.tsx:55` (default role unavailable).
- Environment variables, all in use: `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `HOSTNAME`,
  `NODE_ENV`, `RUN_MIGRATIONS` (entrypoint), `NEXT_OUTPUT` (Docker-only switch), and
  `DORA_PORT`/`DORA_DB_PORT` (Compose). None are unused. `NEXT_OUTPUT` is set internally by the
  Dockerfile and documented in CLAUDE.md, so it is correctly absent from `.env.example`.
- Next.js options in `next.config.ts` (`distDir: ".next.nosync"`, `cacheComponents`,
  `partialPrefetching`, `serverExternalPackages`, `turbopack.rules`) are all active and commented.
  Nothing is legacy.
- No duplicate business logic: the completeness percentage is computed only in
  `src/lib/requirements/progress.ts`. `mock-ai/progress.ts` (per-section counts) and
  `brd/generation.ts` (BRD content counts) call it rather than re-implementing it. The only
  duplication is a one-line `FIELD_LABELS` map derived from `REQUIREMENT_FIELDS` in both
  `lib/mock-ai/templates.ts` and `lib/brd/generation.ts`. It is already recorded as technical
  debt in `IMPLEMENTATION_STATUS.md`. KEEP: merging the two would be a refactor across the
  Mock AI/BRD boundary for a one-liner.

---

## 5. Dependency Audit

**No dependency is unused.** One classification change is proposed (R1). No upgrades.

| Package | Kind | Used by | Verdict |
| --- | --- | --- | --- |
| `next`, `react`, `react-dom` | prod | framework | KEEP |
| `@prisma/client` | prod | Imported by the **generated** client in `src/generated/prisma/*` (`@prisma/client/runtime/*`). Required at runtime and traced into the standalone image | KEEP (knip false positive: generated code is ignored) |
| `@prisma/adapter-pg` | prod | `src/server/db/client.ts` | KEEP |
| `zod` | prod | API and requirements schemas | KEEP |
| `pdfkit` | prod | `src/server/pdf/brd-pdf.ts`; `serverExternalPackages` | KEEP |
| `radix-ui`, `class-variance-authority`, `lucide-react` | prod | `src/components/**` | KEEP |
| `cn` | prod | `src/lib/utils.ts` (`export { cn } from "cn"`), used by every UI file. This is shadcn-ui's own clsx + tailwind-merge replacement (`github.com/shadcn-ui/cn`), not an unrelated package | KEEP |
| `tw-animate-css` | prod | `@import` in `globals.css:2` (build time) | KEEP (could move to dev like R1; not proposed because the gain is negligible) |
| `shadcn` | prod | `@import "shadcn/tailwind.css"` (build time) + CLI | **R1**: move to dev |
| `@tailwindcss/turbopack` | dev | Loader string in `next.config.ts` `turbopack.rules["*.css"]`. Without it Tailwind is not compiled | KEEP (knip false positive: string reference) |
| `tailwindcss` | dev | `@import "tailwindcss"` | KEEP |
| `prisma` | dev | CLI: `postinstall`, `build`, `start`, `db:*`, `tests/db-global-setup.ts`. The Docker migrator stage reads its version from `node_modules/prisma/package.json` | KEEP (dev is correct; Docker installs it separately) |
| `pdfjs-dist` | dev | `tests/pdf-text.ts` (PDF text extraction in tests) | KEEP |
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/pdfkit` | dev | typecheck | KEEP |
| `eslint`, `eslint-config-next` | dev | `npm run lint` | KEEP (`eslint@9` deprecation warning noted; upgrading is out of scope) |
| `vitest` | dev | `npm test`, `npm run test:db` | KEEP |

knip reported no unlisted dependencies, unlisted binaries or unresolved imports.

---

## 6. Git & Docker Hygiene

| Check | Result | Status |
| --- | --- | --- |
| Tracked generated artifacts | None (`src/generated/prisma`, `.next.nosync`, `next-env.d.ts`, `*.tsbuildinfo` all ignored) | VERIFIED |
| Untracked files | None before this report | VERIFIED |
| Ignored files in the working copy | Only `.env` (local, not touched) and `next-env.d.ts`. There is no `node_modules/`, and `src/generated/` is an empty directory, so run `npm ci` before using the working copy | VERIFIED |
| iCloud conflict copies (`* 2.*`) | None (`scripts/clean-project.sh` dry run: 0 items) | VERIFIED |
| Secrets in the tree | None. `.env` is git-ignored and Docker-ignored. `compose.yaml` holds only documented throwaway local credentials | VERIFIED |
| Secrets in history | None. The only connection strings are placeholders (`USER:PASSWORD`, a commented `dora:dora@localhost` example in an old `.env.example`, and the local Compose value). No `.env`, key or certificate was ever committed | VERIFIED |
| Large blobs in history | Only `package-lock.json` (2 versions, ~0.5 MB each) | VERIFIED |
| `.gitignore` coverage | Complete for npm, Next.js (`.next.nosync`), Prisma output, env files, logs, caches, conflict copies. Minor boilerplate (R6) | STATIC |
| `.dockerignore` coverage | Excludes secrets, `node_modules`, build output, generated client, VCS, editor and Docker files. Tests and docs are included (R5, harmless) | STATIC |
| Runtime image contents | Standalone output + traced deps + fonts + migrator; no dev tooling, tests or `.env` (verified in Phase 14) | — |
| Known Docker findings already on record | SEC-05 (migrator installs Prisma without a lockfile) and SEC-06 (runtime files owned by `node`) in `SECURITY_HEALTH_AUDIT.md`. These are hardening changes, not cleanup, so they are out of scope here | — |

---

## 7. Development Leftovers (Stage 2)

| Search | Result |
| --- | --- |
| `TODO`, `FIXME`, `XXX`, `HACK` | none |
| `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `debugger` | none |
| Debug `console.log`/`debug`/`info` | none (only the intentional error/warn calls in §4) |
| Commented-out code blocks | none found |
| Mock data in production paths | none. No seed, no demo records. The Mock AI engine is the required feature |
| Feature flags / disabled functionality | none, apart from the documented Docker switches `NEXT_OUTPUT` and `RUN_MIGRATIONS` |
| Duplicate API implementations | none. 12 route handlers, one per documented endpoint, each thin over a service |
| Experimental or abandoned files from earlier phases | none, except the unused `separator.tsx` (S1) |
| Unused exports | S2, S3, R2–R4. The rest are live code exported from their own file (§4) |

Intentional MVP limitations (not leftovers): no authentication (SEC-01, accepted by the owner),
rule-based replies only, light theme only, no pagination.

---

## 8. Reproducibility Verification

Performed on a **fresh `git clone`** of `main` (`9464e6c`) in a scratch directory outside the
repository, with Node v24.22.1 / npm 11.19.1 and Docker 27.5.1. The Compose stack ran under its own
project name (`dora-cleanup-check`), image tag (`dora:cleanup-check`) and ports (3100/5499), so the
existing `dora` stack, `dora_dora-db` volume and `dora:local` image were not touched.

| # | Step | Command | Result | Status |
| --- | --- | --- | --- | --- |
| 1 | Install from lockfile | `npm ci --no-audit --no-fund` | 844 packages, `postinstall` generated Prisma Client 7.10.1, no lockfile changes (`git status` clean). One warning: `eslint@9` deprecated | VERIFIED |
| 2 | TypeScript | `npm run typecheck` | exit 0 | VERIFIED |
| 3 | Lint | `npm run lint` | exit 0, no warnings | VERIFIED |
| 4a | Unit tests | `npm test` | 14 files, **176 passed** | VERIFIED |
| 4b | DB integration tests | `npm run test:db` against a new database `dora_cleanup_test` inside the throwaway Compose PostgreSQL | migrations applied; 9 files, **79 passed** | VERIFIED |
| — | Schema | `npm run db:validate` | valid | VERIFIED |
| 5 | Production build | `npm run build` | compiled; 13 static pages; all 12 API routes and pages built (PPR on the two dynamic pages) | VERIFIED |
| 6 | Docker image | `docker build -t dora:cleanup-check .` | success | VERIFIED (see note) |
| 7 | Compose start | `docker compose -p dora-cleanup-check … up -d --wait` | `db` and `app` both healthy | VERIFIED |
| 8 | Migrations | container log | "All migrations have been successfully applied." (4 migrations, fresh database) | VERIFIED |
| 9 | PostgreSQL connection | `GET /api/health` | `200 {"status":"ok","database":"ok"}` | VERIFIED |
| 10 | Serves the app | `GET /` → 307 (redirect to `/discovery`), `GET /discovery` → 200, `GET /api/settings` → 200 with the default settings row | VERIFIED |

Notes:

- **Docker cache:** the image build took 32 s because it reused layers cached on this machine for
  identical inputs. A `--no-cache` cold build was not run. Cold-build caveats: it needs network
  access (npm registry; Google Fonts via `next/font/google` during `next build`), and the migrator
  stage resolves Prisma's transitive dependencies without a lockfile (SEC-05), so cold builds are
  functionally but not byte-for-byte reproducible.
- **Leftovers from this audit, all outside the project's data:** the stopped stack's volume
  `dora-cleanup-check_dora-db` (contains `dora` and `dora_cleanup_test`; per the rules, Docker
  volumes were not deleted), the image `dora:cleanup-check`, and the scratch clone. Remove them when
  no longer needed with `docker volume rm dora-cleanup-check_dora-db` and
  `docker image rm dora:cleanup-check`.
- Railway was not touched. The verification is local only.

---

## 9. Final Recommendations

1. **Safe removals:** S1 `src/components/ui/separator.tsx`, S2 `SCENARIO_SUBJECTS`, S3 the unused
   re-export block in `src/lib/mock-ai/progress.ts`.
2. **Need manual approval:** R1 (move `shadcn` to dev), R3 (`ASSISTANT_FULL_NAME`), R7
   (`IMPLEMENTATION_STATUS.md` Phase 14 entry). Recommended to keep as is: R2, R4, R5, R6.
3. **Must remain:** everything listed in §4.
4. **Unused dependencies:** none. `shadcn` is classified wrongly (R1). `@prisma/client` and
   `@tailwindcss/turbopack` are used, though static analysis reports them as unused.
5. **Possibly obsolete code:** S1–S3, R2–R4. No abandoned implementations or duplicate logic.
6. **Git/Docker hygiene issues:** none blocking. Optional `.dockerignore`/`.gitignore` tweaks (R5,
   R6). Hardening items SEC-05/SEC-06 are on record separately.
7. **Reproducibility:** all 10 steps pass from a fresh clone (§8).
8. **Recommended cleanup sequence** (after approval):
   1. Create a branch, e.g. `cleanup/repository`.
   2. Apply S1–S3 in one commit. Run `npm run check`, `npm test`, `npm run build`.
   3. If approved, apply R1: move the `shadcn` line in `package.json`, run
      `npm install --package-lock-only --no-audit --no-fund`, check that the lockfile diff only
      flips `dev` flags, then `npm ci`, `npm run build`, `docker build -t dora .`.
   4. If approved, apply R3 (and any R2/R4–R6 items you choose).
   5. Update `IMPLEMENTATION_STATUS.md` (Phase 14 + this cleanup phase, R7), and the README if a
      user-facing statement changes (none expected).
   6. Re-run the full verification: `npm run check`, `npm test`, `npm run test:db` (dedicated test
      database), `npm run build`, `docker compose up --build` with `DORA_PORT`/`DORA_DB_PORT` set
      if needed, `GET /api/health`.
   7. The owner reviews, commits and pushes. Deploying to Railway remains the owner's manual step.

---

## 10. Applied Changes (after owner approval, 2026-10-24)

Applied on branch `cleanup/repository` and left uncommitted. Applied: S1, S2, S3, R1, R3 (removed)
and R7. Kept as recommended: R2, R4, R5, R6.

| Item | Change |
| --- | --- |
| S1 | deleted `src/components/ui/separator.tsx` |
| S2 | removed `SCENARIO_SUBJECTS` from `src/lib/mock-ai/config/scenarios.ts` |
| S3 | removed the re-export block from `src/lib/mock-ai/progress.ts` (its `import` stays) |
| R3 | removed `ASSISTANT_FULL_NAME` from `src/config/app.ts` |
| R1 | `shadcn` moved to `devDependencies` (`^4.22.1`, unchanged). The lockfile was regenerated with `npm install` in an installed clone. Diff: the moved `shadcn` line plus 293 `"dev": true` and 13 `"devOptional": true` flags; no version, resolution or integrity change. (Running `npm install --package-lock-only` in the working copy without `node_modules` also added 6 bundled-dependency entries of the optional `@tailwindcss/oxide-wasm32-wasi`. That output was discarded.) |
| R7 | `IMPLEMENTATION_STATUS.md`: Phase 14 and final-phase entries, stale repository-state note and next actions updated |

**Verification after the changes** (fresh clone + the changes, Node 24.22.1; all VERIFIED):

| Check | Result |
| --- | --- |
| `npm ci` from the new lockfile | exit 0; lockfile unchanged by the install |
| `npm run check` | exit 0 |
| `npm test` | 14 files, 176 passed |
| `npm run build` | exit 0 (`@import "shadcn/tailwind.css"` resolves from the dev dependency) |
| `docker build` | success. The `npm ci` layer was rebuilt because the lockfile changed |
| Compose (`dora-cleanup-check`, ports 3100/5499) | `db` and `app` healthy |
| `npm run test:db` (`dora_cleanup_test`) | 9 files, 79 passed |
| HTTP | `/api/health` 200 `{"status":"ok","database":"ok"}`; `/` 307; `/discovery`, `/brds`, `/settings` 200 |
| Runtime image | no `shadcn` in `node_modules` (as before); `@prisma/client` present |

The check stack was stopped afterwards (`docker compose down`, no `-v`). Its volume
`dora-cleanup-check_dora-db` and the image `dora:cleanup-check` remain (see §8).
