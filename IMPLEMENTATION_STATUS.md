# DORA — Implementation Status

**Baseline date:** 2026-10-23 · **Audit:** Phase 08.5 (no application code, schema, migrations or data changed)
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
| 09+ | BRD editor & regeneration, PDF export, settings editing, Railway deployment | Not started |

> **Repository state:** none of Phases 01–08 is committed. `git log` contains only the initial
> commit; all ~124 source files are untracked. See issue H1.

## 2. Verification summary (this audit)

Legend — **A** automated test · **M** manual run during this audit (browser automation or curl
against a running server) · **S** static code inspection · **NV** not verified.

| Check | Result | Notes |
| --- | --- | --- |
| `prisma validate`, `prisma format --check` | PASS | |
| TypeScript (`npm run typecheck`) | PASS in a clean copy; **FAIL in working tree** | 386 duplicate `* 2.*` files in `.next/` (sync conflict copies) cause `Duplicate identifier 'LayoutProps'` — environment issue H2, not a code defect |
| ESLint | PASS | 0 problems |
| Production build (`npm run build`, no `DATABASE_URL`) | PASS (clean copy) | 17 routes; dynamic routes partially prerendered |
| Unit tests | PASS 163/163 | 12 files |
| Integration tests (real PostgreSQL, `TEST_DATABASE_URL`) | PASS 59/59 | 5 files; tests remove only their own records |
| Migrations | PASS | dev & test DB up to date, no drift; all 3 migrations applied to a new empty DB; settings row created, no demo data; FKs `ON DELETE CASCADE`; CHECK constraints present |
| Browser workflows (production server, isolated `dora_audit` DB) | PASS 80/80 | chat (31), progress & roles (27), BRD (22) — scripts are outside the repo (issue M2) |
| Dev server (`next dev`) | PASS | pages + API + first message |
| Database unreachable | PASS | all API routes → `503 DATABASE_UNAVAILABLE` JSON; static page shells still render |
| Railway deployment | **NV** | never deployed; see H3, M1 |
| PostgreSQL version parity | **NV** | verified on PostgreSQL 14 locally only |

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
| Typecheck/lint/build pass | PARTIAL | pass in clean copy; working-tree typecheck blocked by H2 |

### Phase 02 — Database & Prisma
| Requirement | Status | Evidence |
| --- | --- | --- |
| 5 entities, enums, 18 fields in validated JSON | PASS | S, A |
| Relations, unique `sessionId`, indexes, cascade delete | PASS | A, S |
| Clarification counters, manual-edit metadata column | PASS | S (`manualEdits` not yet written — Phase 09) |
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

### Specification items not yet implemented (later phases)
BRD editor (`PATCH /api/brds/[id]`, unsaved-change warning), regeneration
(`POST /api/brds/[id]/regenerate`, manual-edit preservation), PDF export
(`GET /api/brds/[id]/pdf`), settings editing (`PATCH /api/settings`), Railway deployment
instructions and deployment, acceptance scenarios **E** (manual edit survives regeneration) and
**F** (PDF). Scenarios A, B, C, D, G, H: PASS.

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
| BRD rules | `src/lib/brd/generation.ts` |
| API contracts | `src/lib/api/{types,chat-schemas,client}.ts` |
| Server services | `src/server/discovery/discovery-service.ts`, `src/server/sessions/{session-service,processing-lock,serializers}.ts`, `src/server/brds/brd-service.ts`, `src/server/db/*`, `src/server/api/http.ts`, `src/server/errors.ts` |
| Route handlers | `src/app/api/chats/**`, `src/app/api/brds/**`, `src/app/api/settings/route.ts` |
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
8. **BRD:** content only from Provided fields (unclear values are not copied); Ready for Review = all 18 fields have content (not approval); one BRD per session enforced by unique constraint; repeated generation returns the existing BRD unchanged (regeneration is a separate operation, Phase 09).
9. **Next.js 16 specifics:** `connection()` in GET handlers; `unstable_rethrow` in the error wrapper; dynamic params and `usePathname` wrapped in `Suspense`; pages preserved by `<Activity>` — New Discovery keyed by `bfcacheId` and reset after handover.
10. **Settings row** inserted by the initial migration (Railway's fixed start command cannot seed); `ensureAppSettings()` is the runtime fallback.

## 7. Corrections to earlier phase reports

- **Phase 04** reported "sessions persist after restart". That check was invalid: an orphaned server kept serving after `pkill`. Persistence across a real restart was verified in Phase 06 (different PID).
- **Browser test scripts** used in Phases 06–08 began with `delete from "ChatSession"` on the local throwaway `dora_dev` database. This audit ran them only against a newly created `dora_audit` database.

## 8. Known issues (by severity)

### Critical
None found.

### High
- **H1 — Nothing is committed.** All work since the initial commit is untracked; no history, no rollback, risk of loss (aggravated by H2). *Action:* commit the baseline before Phase 09.
- **H2 — Folder sync creates conflict copies.** 386 `* 2.*` duplicates appeared in `.next/` (twice); they break `npm run typecheck` in the working tree. The project is under `~/Documents`, consistent with iCloud Desktop & Documents sync; the same could hit source files or `node_modules`. *Action:* move the repository out of the synced folder (or exclude it), then delete `.next/`.
- **H3 — Prisma CLI is a devDependency but needed at runtime.** `npm start` runs `prisma migrate deploy`, and `postinstall` runs `prisma generate`. If the Railway build prunes or omits dev dependencies, start-up fails. NV on Railway. *Action (deployment phase):* move `prisma` to `dependencies` or verify the Railway install mode.

### Medium
- **M1 — No Railway deployment instructions** in the README (spec §2/§11 deliverable); deployment never tested.
- **M2 — UI workflows have no repeatable automated tests in the repository.** The 80 browser checks are ad-hoc scripts outside the repo; API/engine coverage is in Vitest.
- **M3 — Simulated delay has no upper bound** (DB CHECK only `>= 0`; editing not yet possible). A delay ≥ the 30 s lock timeout would let a concurrent request take over the lock; the first turn would then be rejected (no corruption, but a lost/failed send). *Action (settings phase):* bound the delay well below `PROCESSING_LOCK_TIMEOUT_MS`.

### Low
- **L1 — Failed turns that acquired the lock bump `ChatSession.updatedAt`** (Prisma `@updatedAt` on `updateMany`), moving the session to the top of the sidebar. Verified (M).
- **L2 — Corrupted requirement JSON makes the session unviewable** (`GET /api/chats/[id]` → 500) rather than degrading gracefully. Verified (M). Only reachable by direct DB manipulation.
- **L3 — `pg` deprecation warning** ("client.query() while already executing") from Prisma's query interpreter in the first-message transaction; would break with `pg@9`. Locked at `pg@8.23.1`.
- **L4 — `BrdDetail.missingFields[].status` is always `MISSING`** (the BRD does not store original field statuses); the type suggests otherwise.
- **L5 — No cross-tab refresh:** sidebar lists and Activity-preserved pages can show stale data after changes in another tab.
- **L6 — Length-based fallback acceptance:** for fields that allow it, any sufficiently long answer is recorded even if it addresses another topic (inherent to keyword rules; documented).
- **L7 — Role change applies from the next reply;** the already-shown question keeps the old wording; the role-change notice is not persisted.
- **L8 — No pagination** for session and BRD lists.
- **L9 — PostgreSQL 14 used locally;** Railway's version not tested.

### Technical debt
- Ad-hoc browser scripts (M2) should become a maintained E2E suite if UI regression coverage is wanted.
- `FIELD_LABELS` is derived in two places (`lib/mock-ai/templates.ts`, `lib/brd/generation.ts`).
- The integration tests stub `next/server` `connection()` and the delay module; route handlers are not exercised through a real Next.js server in automated tests.

## 9. Readiness for Phase 09 (BRD editor & regeneration)

**READY FOR PHASE 09 — no application-code fixes required first.** Before starting, resolve the
two non-code items **H1** (commit the baseline) and **H2** (move the repo out of the synced folder
and delete `.next/`), because H2 currently breaks `npm run typecheck` in the working tree.

Phase 09 can build on existing structures without restructuring:
`BusinessRequirementsDocument.content` + `manualEdits` (Zod schemas exist), `buildBrdSections`
(already reports `manuallyEdited`), pure generation rules in `lib/brd`, and the BRD service.
Points to decide in Phase 09: regeneration fills only empty fields (spec §6) — generated,
non-empty fields are therefore also kept; saving an empty field should store `null` and count as
missing; status/completeness must be recalculated from saved content.

## 10. Recommended next actions

1. Commit the current baseline (H1).
2. Move the repository out of `~/Documents` (or exclude it from sync), delete `.next/`, re-run `npm run check` (H2).
3. Proceed with Phase 09.
4. In the settings phase: bound `mockResponseDelayMs` (M3).
5. In the deployment phase: resolve H3, write Railway instructions (M1), deploy and verify on Railway's PostgreSQL (L9).
6. Optionally: turn the browser checks into a maintained E2E suite (M2).
