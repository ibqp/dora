# DORA — Implementation Status

**Last update:** 2026-10-24 · Final phase (repository cleanup) · previous audits: Phase 14 (security & health), Phase 08.5
**Source of truth:** [`MASTER_SPEC.md`](MASTER_SPEC.md) · Setup and API reference: [`README.md`](README.md)

## 1. Overview

DORA (Requirements Discovery Tool) is an educational MVP: a rule-based, deterministic "Mock AI"
guides stakeholders through requirements discovery and produces a BRD. Stack: Next.js 16 (App
Router, Cache Components), TypeScript strict, Tailwind v4 + shadcn/ui, PostgreSQL via Prisma 7
(`@prisma/adapter-pg`), Zod 4, Vitest. No LLM or external AI service is used.

| Phase | Scope | Status |
| --- | --- | --- |
| 01 | Project foundation | **Complete** |
| 02 | Database & Prisma | **Complete** |
| 03 | Application shell | **Complete** |
| 04 | Sessions & messages API | **Complete** |
| 05 | Mock AI engine | **Complete** (documented design interpretations, §6) |
| 06 | Discovery chat | **Complete** |
| 07 | Progress & roles | **Complete** |
| 08 | BRD generation | **Complete** |
| 09 | BRD editor & regeneration | **Complete** (§3, Phase 09) |
| 10 | PDF export | **Complete** (§3, Phase 10; Railway runtime not verified) |
| 11 | Settings & UX polish | **Complete** (§3, Phase 11) |
| 12 | Final verification, Docker, deployment preparation | **Complete** (§3, Phase 12) — **not deployed**: Railway deployment is a manual step ([`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md)) |
| 13 | Safe project cleanup | **Complete** (§3, Phase 13) |
| 14 | Security, reliability & health audit (read-only) | **Complete** — report: [`SECURITY_HEALTH_AUDIT.md`](SECURITY_HEALTH_AUDIT.md) (verdict *ready with accepted risks*; findings not yet remediated) |
| Final | Repository sanity & dead-code cleanup | **Complete** (§3, Final phase) — report: [`REPOSITORY_CLEANUP_REPORT.md`](REPOSITORY_CLEANUP_REPORT.md) |

> **Repository state:** Phases up to 14 are committed and pushed (`9464e6c Phase 14`); the final
> cleanup is in the working tree on branch `cleanup/repository`, uncommitted. The owner reports
> that DORA is deployed on Railway; the deployment was not verified by these phases.

## 2. Verification summary

Rows reflect the Phase 08.5 audit unless marked with a later phase, which were re-run after that
phase.

Legend — **A** automated test · **M** manual run during this audit (browser automation or curl
against a running server) · **S** static code inspection · **NV** not verified.

| Check | Result | Notes |
| --- | --- | --- |
| `prisma validate`, `prisma format --check` | PASS | |
| `prisma validate` *(Phase 12)* | PASS | no Prisma schema change since Phase 11 (migration `20261023230000_settings_delay_bounds`, CHECK only) |
| TypeScript + ESLint (`npm run check`) *(Phase 12)* | PASS | 0 errors, 0 warnings |
| TypeScript (`npm run typecheck`) | PASS | failed in the working tree during the audit because of iCloud conflict copies in `.next/` (H2); passes since the build output moved to `.next.nosync/` |
| ESLint | PASS | 0 problems |
| Production build (`npm run build`, no `DATABASE_URL`) *(Phase 12)* | PASS | 20 routes (Phase 12 adds `/api/health`); regular output locally, standalone output in the Docker build |
| Unit tests *(Phase 12)* | PASS 176/176 | 14 files |
| Integration tests (real PostgreSQL) *(Phase 12)* | PASS 79/79 on PostgreSQL 14.20 (local, final run incl. new `health.db.test.ts`); PASS 78/78 on PostgreSQL 17.11 (Docker, fresh `dora_test`, run before the health test was added) | tests remove only their own records and restore the shared settings row |
| Docker image build *(Phase 12)* | PASS | `docker build` linux/arm64 (native) and `docker buildx --platform linux/amd64` (emulated, 219 s); see §3 Phase 12 |
| Docker runtime (Compose: app + PostgreSQL 17) *(Phase 12)* | PASS | migrations on a fresh DB, health, endpoints, acceptance A–H 24/24, persistence across restart / down-up / rebuild, PDF in the container |
| Migrations | PASS | dev & test DB up to date, no drift; all 3 migrations applied to a new empty DB; settings row created, no demo data; FKs `ON DELETE CASCADE`; CHECK constraints present |
| Browser workflows (production server, isolated `dora_audit` DB) | PASS 80/80 | chat (31), progress & roles (27), BRD (22) — scripts are outside the repo (issue M2) |
| Settings, keyboard & dialog accessibility browser workflow *(Phase 11)* | PASS 32/32 | production server, `dora_phase09`, headless Chrome; settings restored and test sessions deleted afterwards (M2: script outside the repo) |
| axe-core scan of all pages at 1440 px + overflow check at 1440/1024/900 px *(Phase 11)* | PASS (0 violations, no overflow) | new discovery, session chat, BRD list (empty/filled), BRD editor, settings, 404, unknown session/BRD; dialogs/menus scanned in the workflow above (page-level rules hidden by modal popups excluded, focus trap checked instead) |
| PDF export browser workflow *(Phase 10, re-run in Phase 11)* | PASS 18/18 | production server, `dora_phase09` DB, headless Chrome: Export PDF click → download → PDF parsed with pdf.js; script outside the repo (M2); DB left empty |
| BRD editor browser workflow *(Phase 09, re-run in Phases 10 and 11)* | PASS 44/44 | production server on a dedicated `dora_phase09` DB, headless Chrome via Playwright; script outside the repo (M2); the test session was deleted afterwards (DB left empty) |
| Dev server (`next dev`) | PASS | pages + API + first message |
| Database unreachable | PASS | all API routes → `503 DATABASE_UNAVAILABLE` JSON; static page shells still render |
| Railway deployment | **NV** | not deployed (manual step by the owner); guide in `RAILWAY_DEPLOYMENT.md` |
| PostgreSQL version parity *(Phase 12)* | PASS (14, 17) | full DB suite and the container on PostgreSQL 17; Railway's actual version NV |

### Critical workflows

| Workflow | Result | Evidence |
| --- | --- | --- |
| First message creates session (none before) | PASS | A (`chats.db.test.ts`), M (DB count 0 after opening New Discovery) |
| Session & message persistence, ordering, reload, restart | PASS | A (insertion `sequence`), M (reload; server restart verified in Phase 06 — the Phase 04 restart claim was invalid, see §7) |
| Scenario classification (4 scenarios, generic fallback, negation) | PASS | A (`classification.test.ts`), M |
| Mandatory XY-problem validation | PASS | A (all roles × request types), M (Scenario B) |
| Requirements extraction (answers, explicit statements) | PASS | A (`extraction.test.ts`, `engine.test.ts`) |
| Discovery state transitions (6 stages, forward-only) | PASS | A (`state-machine.test.ts`), M |
| Clarification & skip (bounded: max 2 clarifications) | PASS | A (bounded-turn test for every role), M |
| Explicit corrections (update one field; ambiguity → no change) | PASS | A |
| Completeness (Provided / 18, rounded; skipped/missing excluded) | PASS | A, M |
| Assistant role switching (persisted; requirements intact; next reply uses new role) | PASS | A (`requirements.db.test.ts`), M |
| BRD from structured requirements (never invented) | PASS | A (`generation.test.ts`, `brd.db.test.ts`), M (17 × "Not specified") |
| Incomplete draft generation (warning + explicit consent) | PASS | A (409 without `allowIncomplete`), M (dialog) |
| Manual BRD edits persist; unsaved edits are not saved *(Phase 09)* | PASS | A (`brds/[id]/brd.db.test.ts`), M (API unchanged while dirty; value restored after reload) |
| Regeneration preserves manual edits, keeps BRD id (Scenario E) *(Phase 09)* | PASS | A (unit + DB), M |
| BRD status/completeness from saved content *(Phase 09)* | PASS | A (clear → Draft, fill → Ready for Review), M (11 % → 100 % → 94 %) |
| Settings persist; default role for new sessions; existing roles unchanged; delay applied to the next reply *(Phase 11)* | PASS | A (`settings.db.test.ts`: delay mock called with the new value), M (reply after 766 ms with 500 ms set, 2,873 ms with 2,500 ms) |
| PDF export of the saved BRD (Scenario F) *(Phase 10)* | PASS | A (`pdf.db.test.ts`, `brd-pdf.test.ts`), M (download via button, content checked) |
| Exactly one BRD per session (incl. concurrent requests) | PASS | A (5 concurrent → 1), M |
| Session deletion cascades (messages, requirements, BRD) | PASS | A, M, S (FK `confdeltype = c`) |
| Overlap/duplicate protection (lock + idempotency key) | PASS | A (409 `SESSION_BUSY`, replay, concurrent first messages), M (double Enter → 1 request) |
| Simulated delay without open transaction | PASS | A (rename succeeds while turn is waiting) |

## 3. Phase-by-phase audit

### Phase 01 — Project foundation
| Requirement | Status | Evidence |
| --- | --- | --- |
| Next.js App Router, strict TS, Tailwind, shadcn/ui, Lucide | PASS | S, build |
| `src/` structure, theme tokens (light only, magenta `#E20074`) | PASS | S |
| `.env.example`, `.gitignore` (secrets excluded, template kept) | PASS | S |
| Scripts, README setup | PASS | S |
| Typecheck/lint/build pass | PASS | after the H2 fix (`distDir: ".next.nosync"`) |

### Phase 02 — Database & Prisma
| Requirement | Status | Evidence |
| --- | --- | --- |
| 5 entities, enums, 18 fields in validated JSON | PASS | S, A |
| Relations, unique `sessionId`, indexes, cascade delete | PASS | A, S |
| Clarification counters, manual-edit metadata column | PASS | S (`manualEdits` written since Phase 09) |
| Migrations + single settings record, no demo data | PASS | M (fresh DB) |
| Reusable DB client (lazy, works without DB at build) | PASS | build without `DATABASE_URL` |

### Phase 03 — Application shell
| Requirement | Status | Evidence |
| --- | --- | --- |
| Desktop layout, sidebar (branding, New Discovery, Sessions, BRDs, Settings) | PASS | M |
| Page header, empty, loading, confirmation components | PASS | M (ConfirmDialog used for deletion) |
| No horizontal overflow (900–1920 px; 1024 px with panels) | PASS | M |
| Settings page shell | PARTIAL (by plan) | honest "not editable yet" notice; editing is a later phase |

### Phase 04 — Sessions & messages API
| Requirement | Status | Evidence |
| --- | --- | --- |
| `GET/POST /api/chats`, `GET/PATCH/DELETE /api/chats/[id]` | PASS | A |
| Zod validation, consistent JSON errors, meaningful status codes | PASS | A (400/404/405/409/415/503) |
| Atomic first message, idempotency (unique `clientRequestId`) | PASS | A (5 concurrent → 1 session) |
| Persistence services reusable in transactions | PASS | S |

### Phase 05 — Mock AI engine (`src/lib/mock-ai/`)
| Requirement | Status | Evidence |
| --- | --- | --- |
| Configurable keyword classification, generic fallback | PASS | A |
| Explicit six-stage state machine | PASS | A |
| Mandatory XY validation; solution vs problem/outcome distinction | PASS | A, M |
| 18 fields with statuses; extraction by expected field + patterns | PASS | A |
| No repeated questions for completed fields | PASS | A |
| Bounded clarification, skip | PASS | A |
| Corrections without overwriting unrelated fields | PASS | A |
| Central completeness | PASS | A |
| Four roles (priorities + templates) | PASS | A |
| Deterministic, pure, no DB/React/AI | PASS | A (determinism), S (imports, no clock/random) |

### Phase 06 — Discovery chat
| Requirement | Status | Evidence |
| --- | --- | --- |
| Bubbles, timestamps, auto-scroll, typing indicator (~1.5 s) | PASS | M (reply after ~1.7 s) |
| Multiline input, Enter/Shift+Enter, disabled empty | PASS | M |
| Engine integrated; turn persisted transactionally | PASS | A (stored reply equals engine output) |
| First-message flow, load/continue, reload restore | PASS | A, M |
| Delay without open transaction | PASS | A |
| Overlap/duplicate prevention | PASS | A, M |
| Loading/error/retry; failed send stores nothing | PASS | M, A |
| Sidebar rename & delete | PASS | M |

### Phase 07 — Progress & roles
| Requirement | Status | Evidence |
| --- | --- | --- |
| Completeness %, current stage, six stages with indicators | PASS | M |
| Missing/completed requirements per section | PASS | M |
| Role dropdown, four roles, persisted per session | PASS | A, M |
| Requirements preserved on role change; new role applied next | PASS | A, M |
| Restore role/stage/completeness after reload | PASS | A, M |
| Progress from field states, not message count | PASS | A |

### Phase 08 — BRD generation
| Requirement | Status | Evidence |
| --- | --- | --- |
| BRD from structured requirements; 7 sections / 18 fields | PASS | A, M |
| Generate at any stage; missing-field warning; draft consent | PASS | A, M |
| "Not specified" for missing values; nothing invented | PASS | A, M |
| Draft / Ready for Review by completeness | PASS | A, M |
| Exactly one BRD per session; persisted; list/create/detail APIs | PASS | A, M |
| DORA's BRD suggestion when sufficiently complete | PASS | A, M (after review confirmation) |

### Phase 09 — BRD editor & regeneration
| Requirement | Status | Evidence |
| --- | --- | --- |
| Dedicated editor page: title, status, created/updated, source session link | PASS | M |
| Editable input for the title and each of the 18 fields (seven sections) | PASS | M (18 text areas + title input) |
| Save Changes persists explicitly; only changed fields are sent | PASS | A, M |
| Unsaved-change tracking (header count, per-field "Unsaved", Discard) | PASS | M |
| Warning before navigation with unsaved changes | PASS (in-app links, reload/close) · **not** for browser back/forward | M (dialog on sidebar link and Back to Discovery; `beforeunload` on reload); limitation N1 |
| Unsaved edits are not silently saved | PASS | M (API value unchanged while dirty, after "Stay", after dismissing reload prompt, after "Discard and leave") |
| `PATCH /api/brds/[id]` (Zod: known field keys only, max 4000 chars, title 1–200) | PASS | A (400/404 cases, no-op save leaves `updatedAt`) |
| Manual edits tracked separately (`manualEdits[key] = { editedAt }`), shown as "Manually edited" | PASS | A, M |
| `POST /api/brds/[id]/regenerate`: manual edits and other content kept, only empty fields filled from PROVIDED requirements | PASS | A (unit + DB), M (16 fields filled, 2 manual edits kept) |
| Same BRD id, title and creation date after regeneration; still one BRD per session | PASS | A, M |
| Status and completeness recalculated from saved content (save and regenerate) | PASS | A, M |
| Concurrent save/regenerate do not lose edits | PASS | A (row lock; the test fails 3/3 runs with the lock removed) |

### Phase 10 — PDF export
Library: **PDFKit 0.20** (pure JavaScript, no headless browser or native dependency → suitable
for Railway; listed in `serverExternalPackages`). Font: Geist 1.7.2 TTF (SIL OFL) vendored in
`assets/fonts/geist/`. Visual review: pages rendered with pdf.js (Chrome) and macOS Quartz (`sips`).

| Requirement | Status | Evidence |
| --- | --- | --- |
| `GET /api/brds/[id]/pdf`: 200 `application/pdf`, `attachment` with ASCII + UTF-8 file name, `no-store`; JSON 400/404 errors | PASS | A, M |
| Valid PDF (header/trailer, parseable by pdf.js, metadata title) | PASS | A, M |
| Generated from the saved BRD; manual edits appear (marked "Manually edited"); latest save is exported | PASS | A (two successive saves → only the second value), M (save then export) |
| Title line, BRD title, document date (last saved, UTC), created, status, completeness, source session | PASS | A, M |
| All seven sections with all 18 field labels | PASS | A |
| Missing values clearly marked ("Not specified — missing information", amber) | PASS | A (count = missing fields), M (visual) |
| Page numbers "Page n of N" on every page | PASS | A, M |
| Multi-page flow without clipping (18 × ~3,800 chars → 20 pages; 3,000-char unbroken token wraps) | PASS | A (all end markers present; no body text in footer zone or outside the page), M (visual) |
| Label kept with its value; section heading not stranded at page end | PASS | M (visual), S |
| Professional typography, restrained magenta accents | PASS | M (visual review; subjective) |
| Export PDF button (disabled while there are unsaved changes; error shown inline) | PASS | M |
| No browser screenshots used | PASS | S (server-side PDFKit drawing) |
| Fix introduced with the extra button: shared `PageHeader` actions now wrap instead of overflowing (`max-w-full`); editor's unsaved badge moved below the title | PASS on the BRD editor at 1024 px (M, dirty and clean) · other pages S only |
| Works on Railway | **NV** | not deployed (deployment phase) |

### Phase 11 — Settings & UX polish
| Requirement | Status | Evidence |
| --- | --- | --- |
| `GET`/`PATCH /api/settings` (Zod: known role, integer delay 0–5000, at least one field, no unknown keys) | PASS | A (bounds, 400 cases incl. strings/decimals/null/unknown keys, 415) |
| Settings persisted in PostgreSQL; survive reload | PASS | A, M |
| Settings page: role select with descriptions, delay input with inline validation, Save Changes / Discard, unsaved-change guard, loading and error/retry states | PASS | M (loading/error states: S — error state not forced in the browser) |
| Default role applied to new sessions (API and New Discovery preselection); explicit first-message role wins | PASS | A, M |
| Existing sessions keep their role when the default changes | PASS | A, M |
| Delay change applies from the next reply (also mid-session) | PASS | A, M (timed) |
| Delay bounded below the processing-lock timeout (M3) | PASS | A (`MAX × 2 < 30 s`), DB `CHECK` 0–5000 (A) |
| No placeholder buttons/notices remain | PASS | S (`grep` for "not yet"/"not available"/"coming soon": none), M |
| Accessibility fixes from the axe review: warning/destructive contrast (tokens → amber-800/red-700), "Asking now" row contrast, progress panel and missing-field list keyboard-scrollable, `h1` on not-found/error/unknown-record pages, 404 page title, skip link | PASS | M (axe re-scan: 0 violations), keyboard workflow |
| Desktop responsiveness: no horizontal overflow at 900/1024/1440 px on all pages; role label truncates with ellipsis | PASS | M |
| Existing workflows unchanged | PASS | A (all suites), M (Phase 09 and 10 browser suites re-run) |

### Phase 12 — Final verification, Docker & deployment preparation

**Critical acceptance scenarios** — browser automation (Playwright, headless Chrome) through the
real UI against the **Docker container** (Compose, PostgreSQL 17); result 24/24:

| Scenario | Result | What was checked |
| --- | --- | --- |
| A — New session | PASS | no DB row after opening New Discovery; session + 2 messages after the first message |
| B — XY problem | PASS | reply asks "what business problem…"; problem statement/outcome stay MISSING; stage Business Problem Validation |
| C — Persistence | PASS | after 4 messages (17 %): reload restores all 8 messages, completeness, role, stage |
| D — Draft BRD | PASS | warning lists 15 incomplete fields; Draft; 15 × "Not specified" |
| E — Manual editing | PASS | edit saved, discovery continued, regenerate → edit kept, same BRD id, one BRD |
| F — PDF | PASS | Export PDF download is a valid PDF (2 pages) containing title, discovery answer, manual edit, "Not specified" markers, page numbers |
| G — Deletion | PASS | session, messages, requirement state and BRD rows = 0; API 404 |
| H — Role switching | PASS | role persisted; requirements and messages unchanged |

Also covered by the automated suites (A): all API endpoints (status codes, Zod validation,
consistent errors), Mock AI engine (classification, XY validation, extraction, state machine,
clarification/skip, corrections, roles, determinism), completeness, BRD rules, settings.

**Docker** (`Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `compose.yaml`):

| Requirement | Status | Evidence |
| --- | --- | --- |
| Multi-stage build, Node.js 24 LTS (`node:24.22.1-bookworm-slim`, matches `.nvmrc`) | PASS | build (M) |
| Next.js standalone output (only in the Docker build via `NEXT_OUTPUT=standalone`) | PASS | image contains `server.js` + traced `node_modules` (51 MB) |
| Prisma Client generated; runtime deps + migrations included | PASS | migrations ran from the image; queries work |
| Non-root user | PASS | `id` → `uid=1000(node)` |
| Binds `0.0.0.0`, honours `PORT`, robust against platform-set `HOSTNAME` | PASS | `PORT=8080`/`4000` runs; `HOSTNAME=some-container` still binds `0.0.0.0` |
| `DATABASE_URL` required; no secrets/`.env` in image; no PostgreSQL in image | PASS | missing → exit 1 with message; `find` for `.env*` in image: none |
| PDF export in the container | PASS | Compose (arm64) and amd64 image: `GET /api/brds/[id]/pdf` → 200 `application/pdf`, `%PDF-` |
| amd64 (Railway's architecture) | PASS (emulated) | amd64 image: x86_64, `schema-engine-debian-openssl-3.0.x`, migrations on a fresh DB, session/BRD/PDF |
| Graceful stop | PASS | `docker compose restart`/`down` in 3–4 s (SIGTERM handled) |
| Image size | ~770 MB uncompressed | ~250 MB is the Prisma CLI needed for `migrate deploy`; accepted (N11) |

**Migration strategy:** `prisma migrate deploy` in the container start command, before
`node server.js` (`docker/entrypoint.sh`); never during the image build; no reset, no seed, no
`db push`. Alternative documented: Railway pre-deploy command + `RUN_MIGRATIONS=false`.

| Check | Status | Evidence |
| --- | --- | --- |
| Fresh database: all 4 migrations applied, then server starts | PASS | Compose (PostgreSQL 17) and amd64 run; settings row created by the migration |
| Restart: `No pending migrations to apply.` | PASS | Compose down/up |
| Server does not start when migrations cannot run | PASS | unreachable DB → `P1001`, exit 1, no "Starting server" |
| `RUN_MIGRATIONS=false` skips; documented pre-deploy command works | PASS | M |
| Data persistence across `restart`, `down`/`up` (volume kept) and image rebuild | PASS | session, messages, BRD manual edit, settings value, PDF after restart |

Additions: `GET /api/health` (health check for Docker/Railway; DB ping) with a DB test.
Sequence note: scenarios A–H ran on the image built before the entrypoint was changed to pin
`HOSTNAME=0.0.0.0`; after that change the rebuilt image was re-verified for health, `PORT`/`HOSTNAME`
handling, persistence across container replacement, and (amd64) migrations, session, BRD and PDF.
Not executed: a real Railway deployment (by instruction), Railway's PostgreSQL version.

### Phase 13 — Safe project cleanup

| Item | Result | Evidence |
| --- | --- | --- |
| Audit (before) | Working tree clean at `3d063c4 Phase 12` (168 tracked files); no build output, caches, logs, `.DS_Store` or conflict copies present (`node_modules`, `.next.nosync` already removed by an earlier run of the owner's script); ignored generated files: `src/generated/prisma`, `next-env.d.ts`; no tracked secrets (only `.env.example`) | M (`git status`, `git status --ignored`, `find`) |
| `scripts/clean-project.sh` | Dry run default, `--apply`, separate `--deep`; skips anything containing Git-tracked files; protects `.env*`, `prisma/`, `assets/`, `tests/`, `docker/`, `public/`, docs; removes iCloud conflict copies only when identical to the original (or in generated code), reports others; never runs docker/git write commands | M (sandbox clone with planted artefacts: tracked files, `.env`/`.env.local`, differing conflict copy, tracked file in `coverage/` all preserved; `--deep` and argument errors) |
| Cleanup run | `--apply` removed 0 items (nothing disposable present) | M |
| `.gitignore` / `.dockerignore` | added conflict copies, `*.log`, tool caches, test reports, `Thumbs.db`, `*.key` (+ `build`, `.vercel`, nested `.DS_Store` in `.dockerignore`); no tracked file newly ignored; Docker context (19 kB) contains `src/`, `prisma/` (incl. migrations), `assets/`, `docker/`, configs — no `.env`, `node_modules`, generated code | M (`git ls-files -ci`, context listing) |
| Verification after cleanup | `npm ci`; check 0 errors; unit 176/176; DB 79/79 (PostgreSQL 14); `prisma validate`; build; `docker build`; Compose start (healthy, no pending migrations), session → draft BRD → PDF 200; pages 200 | A, M |

Docker image `dora:local` and volume `dora_dora-db` were kept (the local Compose database holds one
session not created by these checks; untouched).

### Phase 14 — Security, reliability & health audit

Read-only audit of commit `c75956a`; no code changes. Findings, evidence and the remediation plan
are in [`SECURITY_HEALTH_AUDIT.md`](SECURITY_HEALTH_AUDIT.md) (SEC-01 … SEC-09, REL-01 … REL-07).
SEC-01 (no access control) is accepted by the owner. The other findings are open. It left a local
database `dora_phase14_audit` (see the report §3).

### Final phase — Repository sanity & dead-code cleanup

Audit and evidence: [`REPOSITORY_CLEANUP_REPORT.md`](REPOSITORY_CLEANUP_REPORT.md). Applied after
owner approval (no behaviour change):

| Change | Evidence it was unused |
| --- | --- |
| Removed `src/components/ui/separator.tsx` | no import anywhere (S, knip) |
| Removed `SCENARIO_SUBJECTS` (`lib/mock-ai/config/scenarios.ts`) | no reference (S, knip) |
| Removed the re-export of the completeness functions from `lib/mock-ai/progress.ts` | all consumers import `lib/requirements/progress` (S, knip) |
| Removed `ASSISTANT_FULL_NAME` (`config/app.ts`) | no reference (S, knip) |
| `shadcn` moved from `dependencies` to `devDependencies` (same range `^4.22.1`) | build-time CSS import + CLI only; lockfile diff: only `dev`/`devOptional` flags, no version change (M) |

Kept by decision (report §3 R2, R4–R6): unused Mock AI barrel re-exports and request types,
`.dockerignore`/`.gitignore` as is. No dependency was unused or upgraded.

Verification on a fresh clone with the changes applied: see the "Applied changes" section of the
cleanup report.

### Specification items not yet implemented
None in the application. Railway deployment is prepared but not performed (manual step).
Acceptance scenarios A, B, C, D, G, H: PASS (Phase 08.5); **E**: PASS (Phase 09); **F**: PASS
(Phase 10, A + M; locally, not on Railway).

## 4. Architecture review

| Check | Result |
| --- | --- |
| Mock AI separate from UI and API (pure functions, no DB/React imports) | PASS (S) |
| Requirements state stored independently of messages (`RequirementState.fields` JSON) | PASS (S, A) |
| Real PostgreSQL persistence; no browser-only state for app data (localStorage only for panel preference) | PASS (S, M) |
| No real LLM/AI integrations or dependencies | PASS (S: no SDKs, no external calls) |
| No fake persistence / placeholders presented as working | PASS (S, M) — Settings page explicitly says "not editable yet" |
| Clear module responsibilities | PASS — `lib/` pure domain, `server/` persistence & HTTP, `app/api` thin handlers, `components/` UI |
| Ready for Phases 09–12 without restructuring | PASS — see §8 |

**Layering:** `app/api/*` (validate → call service → serialize) → `server/discovery`,
`server/sessions`, `server/brds` (transactions, locks) → `lib/mock-ai`, `lib/brd`,
`lib/requirements` (pure rules, shared with UI for display).

## 5. Key modules

| Area | Files |
| --- | --- |
| Data model | `prisma/schema.prisma`, `prisma/migrations/*` (3), `prisma.config.ts` |
| Requirement catalog & JSON schemas | `src/lib/requirements/{fields,schemas,progress}.ts` |
| Mock AI | `src/lib/mock-ai/` — `engine.ts` (`processTurn`), `classification.ts`, `extraction.ts`, `solution-detection.ts`, `state-machine.ts`, `roles.ts`, `templates.ts`, `progress.ts`, `config/*` |
| BRD rules | `src/lib/brd/generation.ts` (incl. PDF file name), `src/lib/brd/editing.ts` (save/regenerate rules) |
| PDF | `src/server/pdf/brd-pdf.ts` (PDFKit renderer), `assets/fonts/geist/` (fonts + OFL), `tests/pdf-text.ts` (pdf.js text extraction for tests) |
| API contracts | `src/lib/api/{types,chat-schemas,client}.ts` |
| Server services | `src/server/discovery/discovery-service.ts`, `src/server/sessions/{session-service,processing-lock,serializers}.ts`, `src/server/brds/brd-service.ts`, `src/server/db/*`, `src/server/api/http.ts`, `src/server/errors.ts` |
| Route handlers | `src/app/api/chats/**`, `src/app/api/brds/**` (incl. `PATCH [id]`, `[id]/regenerate`, `[id]/pdf`), `src/app/api/settings/route.ts` |
| UI | `src/components/discovery/*`, `src/components/sessions/*`, `src/components/brds/*`, `src/components/layout/*`, `src/components/common/*`, `src/hooks/*` |
| Tests | `*.test.ts` (unit), `*.db.test.ts` (PostgreSQL), `tests/db-*.ts` (setup), `vitest.config.mts` |

## 6. Important design decisions

1. **Requirement state as validated JSON** (one object per field: value, status, clarification count), Zod-validated on every read/write.
2. **Engine is a pure function** `processTurn({ message, state, role })`; persistence happens around it.
3. **Two-pass clarification:** in the discovery stage unclear answers are deferred (Needs Clarification) and revisited in the clarification stage with an example; the validation stage clarifies immediately. Max 2 clarification questions per field, then Skipped.
4. **Initial request never fills problem/objective fields** — validation is always asked explicitly. The proposed solution is stored separately (`proposedSolution`) as context only.
5. **Corrections** require an explicit cue and field name; ambiguity changes nothing. Plain statements never overwrite provided fields.
6. **Turn persistence:** per-session processing lock (atomic UPDATE, 30 s expiry) + idempotency key (unique `Message.clientRequestId`); delay runs with no transaction open; one transaction stores user message, reply, requirement state and stage.
7. **Message order** by DB-assigned `Message.sequence` (timestamps can tie).
8. **BRD:** content only from Provided fields (unclear values are not copied); Ready for Review = all 18 fields have content (not approval); one BRD per session enforced by unique constraint; repeated generation returns the existing BRD unchanged (regeneration is a separate operation).
9. **Next.js 16 specifics:** `connection()` in GET handlers; `unstable_rethrow` in the error wrapper; dynamic params and `usePathname` wrapped in `Suspense`; pages preserved by `<Activity>` — New Discovery keyed by `bfcacheId` and reset after handover.
10. **Settings row** inserted by the initial migration (Railway's fixed start command cannot seed); `ensureAppSettings()` is the runtime fallback.
11. **BRD editing (Phase 09):** a field is "manually edited" when a save changes its value (normalized: trimmed, CRLF → LF); saving an empty value stores `null` ("Not specified", counts as missing). Status/completeness are always derived from the saved content.
12. **Regeneration (Phase 09):** literal reading of spec §6 — every non-empty field is kept (manual edits *and* earlier generated text), only empty fields are filled, and only from PROVIDED requirements. A field the user cleared is empty and may be filled again; it then becomes generated content (its `manualEdits` entry is removed). The response lists the filled fields so the editor can report them — nothing changes silently. Title, id and `createdAt` are kept. Regenerate is disabled in the UI while there are unsaved changes (it works on saved content).
13. **BRD concurrency (Phase 09):** save and regenerate lock the BRD row with `SELECT … FOR UPDATE` in their transaction (read-modify-write of the JSON content).
14. **PDF (Phase 10):** rendered on the server from `getBrdDetail` (saved content), never from the UI; the editor disables export while there are unsaved changes instead of exporting unsaved text. Dates are printed in UTC (server and viewer time zones differ). The "not specified" count is taken from the rendered fields. Fonts are read from `<cwd>/assets/fonts/geist`, so the server must start in the project root.
15. **Settings (Phase 11):** one shared record; the default role is resolved when a session is created (stored per session, never re-read), the delay is read on every turn. Bounds live in `src/lib/settings/settings.ts` and are enforced by Zod and a DB `CHECK`. Settings tests restore the shared row after each test.

## 7. Corrections to earlier phase reports

- **Phase 04** reported "sessions persist after restart". That check was invalid: an orphaned server kept serving after `pkill`. Persistence across a real restart was verified in Phase 06 (different PID).
- **Browser test scripts** used in Phases 06–08 began with `delete from "ChatSession"` on the local throwaway `dora_dev` database. This audit ran them only against a newly created `dora_audit` database.
- **Phase 11 follow-up (2026-10-24, reported during manual testing):**
  - *Page scrolled below the chat input.* Cause (present since Phase 07): the progress panel's `sr-only` status labels are `position: absolute`; with no positioned ancestor they were laid out against the page, not clipped by the panel's scroll area, and stretched the document by ~440 px. Phase 11's overflow audit checked horizontal overflow only. Fix: the app frame (`app-shell.tsx`) and the chat/progress scroll areas are `relative`. Verified (M, 32 checks): the document is exactly the viewport height on all pages at 1280×800, 1024×700 and 1440×900, the chat page ends at the composer, the progress panel still scrolls, skip link and axe unchanged.
  - *`pg` deprecation warning (L3).* Cause isolated with probes: Prisma 7's query interpreter loads the relations of a multi-relation `select` concurrently when it runs inside an interactive transaction, on the single transaction connection. Only `createSessionFromFirstTurn` did that (detail read inside its transaction). Fix: the detail is read after the commit. Verified (A): full DB suite (78/78) and a production-server run emit no deprecation warning.

## 8. Known issues (by severity)

### Critical
None found.

### High
- **H1 — RESOLVED.** Baseline committed (`1bdd255`). Keep pushing to `origin`: the repository is inside iCloud, so the remote is the reliable backup.
- **H2 — MITIGATED.** iCloud Desktop & Documents sync (`~/Documents`) creates conflict copies (`* 2.*`) of frequently rewritten files. The project stays in iCloud. Build output moved to `.next.nosync/` (`distDir`; iCloud skips names ending in `.nosync`) — no copies since. `src/generated/prisma/` (regenerated on every build/install) still receives copies; they are not imported and do not break checks, and are removed manually: `find . -path ./node_modules -prune -o -name '* 2*' -type f -print -delete`. `.git/`, `node_modules/` and `src/` (own code) showed no copies.
- **H3 — RESOLVED for the Docker deployment (Phase 12).** The image ships its own Prisma CLI (migrator stage). Still applies only to non-Docker deployments that prune dev dependencies. Original: **Prisma CLI is a devDependency but needed at runtime.** `npm start` runs `prisma migrate deploy`, and `postinstall` runs `prisma generate`. If the Railway build prunes or omits dev dependencies, start-up fails. NV on Railway. *Action (deployment phase):* move `prisma` to `dependencies` or verify the Railway install mode.

### Medium
- **M1 — RESOLVED (Phase 12).** `RAILWAY_DEPLOYMENT.md`. Deployment itself NV. Original: **No Railway deployment instructions** in the README (spec §2/§11 deliverable); deployment never tested.
- **M2 — UI workflows have no repeatable automated tests in the repository.** The 80 browser checks are ad-hoc scripts outside the repo; API/engine coverage is in Vitest.
- **M3 — RESOLVED (Phase 11).** Delay bounded to 0–5000 ms (Zod + DB `CHECK`). Original issue: **Simulated delay has no upper bound** (DB CHECK only `>= 0`; editing not yet possible). A delay ≥ the 30 s lock timeout would let a concurrent request take over the lock; the first turn would then be rejected (no corruption, but a lost/failed send). *Action (settings phase):* bound the delay well below `PROCESSING_LOCK_TIMEOUT_MS`.

### Low
- **L1 — Failed turns that acquired the lock bump `ChatSession.updatedAt`** (Prisma `@updatedAt` on `updateMany`), moving the session to the top of the sidebar. Verified (M).
- **L2 — Corrupted requirement JSON makes the session unviewable** (`GET /api/chats/[id]` → 500) rather than degrading gracefully. Verified (M). Only reachable by direct DB manipulation.
- **L3 — RESOLVED (2026-10-24, §7).** `pg` deprecation warning ("client.query() while already executing") came from a multi-relation read inside the first-message transaction; that read now runs after the commit.
- **L4 — `BrdDetail.missingFields[].status` is always `MISSING`** (the BRD does not store original field statuses); the type suggests otherwise.
- **L5 — No cross-tab refresh:** sidebar lists and Activity-preserved pages can show stale data after changes in another tab.
- **L6 — Length-based fallback acceptance:** for fields that allow it, any sufficiently long answer is recorded even if it addresses another topic (inherent to keyword rules; documented).
- **L7 — Role change applies from the next reply;** the already-shown question keeps the old wording; the role-change notice is not persisted.
- **L8 — No pagination** for session and BRD lists.
- **L9 — MITIGATED (Phase 12).** DB suite and container verified on PostgreSQL 14 and 17; Railway's actual version NV.

- **N1 (Phase 09) — Browser back/forward is not intercepted** by the unsaved-changes warning (the App Router offers no cancellable navigation event). The page stays hidden in Activity and shows the unsaved edits on return, but Next.js keeps only 3 routes; if the page is evicted the edits are lost. In-app links and reload/close are guarded. Verified (M) for links and reload only.
- **N2 (Phase 09) — Regeneration never refreshes non-empty generated fields.** If a requirement is corrected in the chat after the BRD was generated, the BRD keeps the old text; the user must clear the field (or edit it) and regenerate. This follows spec §6 literally ("fill only empty fields").
- **N3 (Phase 09) — No conflict detection between two editor tabs.** Saves send only changed fields, so different fields merge; the same field edited in two tabs is last-write-wins. A regeneration in another tab shows up after reload, or after returning to the page (refetch on reveal when there are no unsaved edits — S only, not separately tested).

- **N4 (Phase 10) — Characters missing from the Geist font** (e.g. emoji, ✓, most Greek letters) appear as empty boxes in the PDF. Latin (incl. extended), Cyrillic and common punctuation/symbols are covered. Verified (M, pdf.js rendering).
- **N5 (Phase 10) — PDF rendering runs in the request** (not timed separately; in the unit tests a 20-page document renders and is parsed again in about 0.3 s); no caching, no size limit beyond the 18 × 4,000-character field limit. Acceptable for the demo; not load-tested.
- **N6 (Phase 10) — Font path depends on the working directory** (`process.cwd()/assets/fonts/geist`). Satisfied by `npm start` in the project root and by the Docker image (working directory `/app`, fonts traced into the standalone output; PDF verified in the container). On Railway NV.
- **N7 (Phase 10) — The PDF is not tagged (PDF/UA)**; it has a document title, language `en` and section bookmarks, but no structure tree for screen readers.

- **N8 (Phase 11) — Settings are global** for all users of the demo (spec §7: single shared record); there is no per-user preference (no accounts, out of scope).
- **N9 (Phase 11) — Radix popups mark the page `aria-hidden`** while open (axe `aria-hidden-focus`); focus is trapped in the popup (verified), so the hidden controls are not reachable. Standard shadcn/Radix behaviour, accepted.
- **N10 (Phase 11) — Accessibility is verified with axe-core and keyboard checks only**, not with a screen reader.

- **N11 (Phase 12) — Image size ~770 MB** (uncompressed), mostly the Prisma CLI kept for `migrate deploy` at start. Could be reduced by running migrations from a separate image/job.
- **N12 (Phase 12) — Migrations run on every container start.** Correct for one instance; with several replicas use the documented pre-deploy command so they run once.

### Technical debt
- Ad-hoc browser scripts (M2) should become a maintained E2E suite if UI regression coverage is wanted.
- `FIELD_LABELS` is derived in two places (`lib/mock-ai/templates.ts`, `lib/brd/generation.ts`).
- The integration tests stub `next/server` `connection()` and the delay module; route handlers are not exercised through a real Next.js server in automated tests.

## 9. Deployment readiness

**READY FOR MANUAL RAILWAY DEPLOYMENT — not deployed.** The Docker image builds for amd64 and
arm64, applies migrations before serving, runs as non-root on `0.0.0.0:$PORT`, and passed the
acceptance scenarios A–H in a container against PostgreSQL 17. Remaining unverified items can
only be checked on Railway: build on Railway's builders, the reference variable
`${{Postgres.DATABASE_URL}}` over the private network, the domain's target port, Railway's
PostgreSQL version, and PDF export there (N6: the container's working directory is `/app`, where
`assets/fonts` is included by the build — verified locally).

Local environment note: the `dora_dev`/`dora_test`/`dora_audit` databases used in earlier phases
were not present on the local PostgreSQL 14 instance at the start of Phase 09. Phase 09 created
`dora_test` and `dora_phase09` (left empty). Phase 12 used the Compose volume `dora_dora-db`
(left with an empty application database: no sessions, default settings).

## 10. Recommended next actions

1. Review and commit the final cleanup (branch `cleanup/repository`).
2. Record the Railway deployment results here (startup logs, migration logs, smoke test,
   PostgreSQL version).
3. Work through the remediation plan in `SECURITY_HEALTH_AUDIT.md` §11 as needed.
4. Optionally: turn the browser checks into a maintained E2E suite (M2).
