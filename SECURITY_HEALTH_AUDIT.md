# DORA — Security, Reliability & Application Health Audit (Phase 14)

**Date:** 2026-10-24 · **Commit audited:** `c75956a Phase 13` (working tree clean) · **Mode:** read-only
(no application code, configuration, dependency, Docker, schema or migration changes).

Legend for verification status: **VERIFIED** (reproduced by a command or test during this audit) ·
**STATIC** (code/config inspection only) · **CONFIG-DEPENDENT** (depends on Railway/runtime settings) ·
**NOT VERIFIED** (could not be checked safely or at all).

---

## 1. Executive Summary

DORA is a well-structured MVP with good defensive basics: strict Zod validation on every route
(unknown keys rejected, bounded string lengths, CUID-validated IDs), parameterised SQL only,
transactional writes with row locks and idempotency keys, generic error responses without stack
traces, no XSS sinks in the UI, no secrets in the repository or its history, a non-root Docker image
without secrets or dev tooling, and zero known npm vulnerabilities. All automated checks pass
(typecheck, lint, 176 unit tests, 79 integration tests, Prisma validation, production build).

The material risks come from the deployment model, not from code defects:

1. **No access control by design** — any visitor can list, read, edit and delete every session and
   BRD, and change the global settings (SEC-01).
2. **No request body size limit** — a single 50 MB request was fully buffered (server RSS
   +225 MB) before validation rejected it (SEC-02).
3. **No rate limiting / abuse controls** — unbounded data growth and CPU-heavy PDF rendering that
   blocks the Node.js event loop (SEC-03, REL-01).

One functional defect was found: with PostgreSQL unreachable, `GET /api/health` returns
**500 INTERNAL_ERROR** instead of the documented **503 DATABASE_UNAVAILABLE** (REL-02). The health
check still fails correctly (non-2xx), so deployment safety is not affected.

**Verdict: READY WITH ACCEPTED RISKS** — for a *controlled* educational deployment (link shared with
a known audience, fictional data only, owner monitoring). **Not suitable for unrestricted public
exposure** until SEC-01, SEC-02 and SEC-03 are addressed (see §11, §12).

Passing tests and an empty `npm audit` do not prove the application is secure; they show only that
no known issue was detected by these specific checks.

## 2. Audit Scope

| Area | Reviewed |
| --- | --- |
| Specs & docs | `MASTER_SPEC.md`, `CLAUDE.md`, `AGENTS.md`, `IMPLEMENTATION_STATUS.md`, `RAILWAY_DEPLOYMENT.md`, `README.md` (secret scan), `.env.example` |
| Build & config | `package.json`, `package-lock.json`, `next.config.ts`, `prisma.config.ts`, `vitest.config.mts`, `tsconfig.json`, `.gitignore`, `.dockerignore` |
| Docker | `Dockerfile`, `compose.yaml`, `docker/entrypoint.sh`; existing image `dora:local` inspected (not rebuilt) |
| Database | `prisma/schema.prisma`, all 4 migrations, `src/server/db/*` |
| API | all 13 route handlers in `src/app/api/**`, `src/server/api/http.ts`, `src/server/errors.ts`, request schemas in `src/lib/api/*` |
| Services | `src/server/discovery/*`, `src/server/sessions/*`, `src/server/brds/brd-service.ts`, `src/server/pdf/brd-pdf.ts` |
| Domain logic | `src/lib/mock-ai/**` (engine, extraction, classification, state machine, intents, config), `src/lib/requirements/*`, `src/lib/brd/*`, `src/lib/sessions/title.ts` |
| Frontend | `src/app/**` pages/layouts/error boundary, `src/components/**`, `src/hooks/**`, `src/lib/api/client.ts` |
| Tests | unit and `*.db.test.ts` suites, `tests/*` setup |
| Repository | all 168 tracked files, all 4 commits (secret patterns, sensitive file names, large blobs) |

Not in scope / not accessible: Railway (by instruction), production credentials, real deployment.

## 3. Verification Results

All commands run from the project root on macOS (Node 24.22.1, npm 11.19.1) unless noted.
`git status --porcelain` was empty after every step — no tracked file was modified.

| # | Command | Result |
| --- | --- | --- |
| 1 | `npm ci --no-fund` | PASS — 844 packages from the lockfile, no lockfile change (lockfile consistent with `package.json`); `postinstall` ran `prisma generate`. npm warned that 4 packages have install scripts (`@prisma/engines`, `prisma`, `fsevents`, `unrs-resolver`). |
| 2 | `npm audit` / `npm audit --omit=dev` | **0 vulnerabilities** (all / production) |
| 3 | `npm audit signatures` | 844 packages with verified registry signatures, 261 with attestations |
| 4 | `npm outdated` | Patch/minor: `react`/`react-dom` 19.3.0 → 19.3.1, `pdfjs-dist` 6.3.289 → 6.4.299 (dev). Major: `eslint` 10, `typescript` 7, `@types/node` 26, `prisma` 8.0.0-rc (pre-release). Nothing upgraded. |
| 5 | Lockfile scan for `deprecated` | 1 entry: `eslint@9.39.5` (dev only, "no longer supported") |
| 6 | `npm run check` (`next typegen && tsc --noEmit` + `eslint`) | PASS, 0 errors / 0 warnings |
| 7 | `npm test` | PASS 176/176 (14 files) |
| 8 | `npm run db:validate`, `npx prisma format --check` | PASS |
| 9 | `npm run build` | PASS — 20 routes; API routes dynamic |
| 10 | `npm run test:db` with `TEST_DATABASE_URL` → **new dedicated database `dora_phase14_audit`** on local PostgreSQL 14.20 | PASS 79/79 (9 files); all 4 migrations applied to the empty DB |
| 11 | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, `prisma migrate status` (audit DB) | Empty migration (no drift); "Database schema is up to date" |
| 12 | `next start -p 3914` on the audit DB + `curl` probes | Headers, methods, validation, body size, nesting, concurrency, PDF timing — see §4, §5, §8 |
| 13 | `next start -p 3915` with an unreachable dummy `DATABASE_URL` | Pages render; `/api/chats`, `/api/settings` → 503; **`/api/health` → 500** (REL-02); dummy password not present in logs |
| 14 | Scratch Vitest benchmark of `processTurn` with adversarial 4,000-char inputs (files in the session scratchpad, outside the repo) | Max steady-state ≈ 30 ms/turn; first call per process ≈ 100–200 ms (regex compilation) — REL-03 |
| 15 | `docker image inspect dora:local`, `docker run --rm --entrypoint sh dora:local …` | User `node` (uid 1000), no `.env`/keys, no `src/`, no dev packages, 51 MB `node_modules`, 256 MB Prisma CLI, app files owned `node:node` |
| 16 | Git history scan (`git grep` over all commits for credential/key patterns; added-file names; blobs > 300 kB; `git ls-files -ci`) | Only placeholders and the documented throwaway Compose password; the real local DB password from `.env` occurs in **0** files of history; no ignored-but-tracked files |
| 17 | Web check for a React 19.3.1 security advisory | None found; 19.3.0 post-dates the Dec 2025 RSC fixes (CVE-2025-55182/55183/55184, fixed in 19.0.3/19.1.4/19.2.3) |

**Limitations**

- Railway deployment, Railway's PostgreSQL version and Railway networking: **NOT VERIFIED** (by instruction).
- The Docker image was **not rebuilt**; the inspected `dora:local` image (created 2026-10-24 07:44 UTC, arm64) is assumed but not proven to match `c75956a`. amd64 not re-checked (Phase 12 did).
- Database outage *during* operation and recovery after PostgreSQL returns: **NOT VERIFIED** here (the local shared PostgreSQL was not stopped); only "unreachable at start" was tested.
- No load test (by instruction); concurrency checks were limited to ≤ 8 parallel requests.
- No browser-based UI run in this phase; frontend findings are static plus HTTP-level checks.
- Leftover test resource: database **`dora_phase14_audit`** (created by this audit; holds one test session with a BRD). It was not dropped; remove it with `DROP DATABASE dora_phase14_audit;` when no longer needed.

## 4. Security Findings

### SEC-01 — No access control: all data and settings are world-readable and world-writable
- **Severity:** High (for unrestricted public deployment) · Accepted for a controlled demo with fictional data
- **Component:** all API routes, global settings
- **Evidence:** no auth, middleware or `proxy.ts` exists (`src/` has none); `GET /api/chats` lists every session with its ID (`src/app/api/chats/route.ts:10-14`), `GET /api/brds` every BRD (`src/app/api/brds/route.ts:8-12`); `DELETE /api/chats/[id]` (`src/app/api/chats/[id]/route.ts:34-37`), `PATCH /api/brds/[id]` (`src/app/api/brds/[id]/route.ts:21-27`), `PATCH /api/settings` (`src/app/api/settings/route.ts:19-23`). Out of scope per `MASTER_SPEC.md` §12.
- **Scenario:** any visitor (or crawler/script) enumerates `/api/chats`, reads every conversation and BRD, renames or deletes all sessions (cascade removes messages, requirements and BRDs), overwrites BRD fields, or sets the shared delay to 5,000 ms / changes the default role for everyone.
- **Impact:** confidentiality, integrity and availability of all demo data; anything confidential typed into DORA is public. CSRF is moot here (an attacker can call the API directly).
- **Remediation (minimal, no user accounts):** for controlled demos, keep the URL private, use fictional data only, and show a visible "public demo — do not enter confidential information" note. Before unrestricted exposure, gate the whole app behind a single shared credential (e.g. HTTP Basic Auth in a Next.js `proxy.ts` with a password from an env var) or a platform-level access restriction.
- **Status:** VERIFIED (curl: list/read/write work without credentials).

### SEC-02 — No request body size limit
- **Severity:** Medium
- **Component:** `parseJsonBody` (`src/server/api/http.ts:91-107`, `request.json()` at line 102) used by every POST/PATCH route
- **Evidence:** a 50,000,071-byte JSON body to `POST /api/chats` was read completely, then rejected by Zod (400 after 83 ms); server RSS grew from 181 MB to 407 MB for this single request.
- **Scenario:** a few concurrent multi-hundred-MB requests exhaust the container's memory (Railway plans have fixed RAM) → OOM kill → all users disconnected, restart re-runs migrations.
- **Impact:** availability.
- **Remediation:** reject early in `parseJsonBody`: check `Content-Length` and read the body with a byte cap (largest legitimate body is a BRD PATCH ≈ 18 × 4,000 chars + title, ~300 kB worst case with multibyte UTF-8; a 512 kB–1 MB cap is ample), returning 413.
- **Status:** VERIFIED.

### SEC-03 — No rate limiting or abuse controls; unbounded data growth
- **Severity:** Medium
- **Component:** all write routes; PDF route; settings
- **Evidence:** no rate limiting anywhere; no limit on sessions per client or messages per session (`src/server/sessions/session-service.ts`); any visitor can set `mockResponseDelayMs` to 0 (`src/app/api/settings/route.ts:19`), removing the natural per-turn delay; PDF rendering is CPU-heavy (REL-01).
- **Scenario:** a script creates sessions/messages in a loop (each ≤ 4,000 chars, two rows per turn) until the Railway PostgreSQL volume or plan quota fills, or calls `GET /api/brds/[id]/pdf` repeatedly to saturate the CPU.
- **Impact:** availability, storage cost.
- **Remediation:** a simple in-memory per-IP limiter in `proxy.ts` (single instance) for write routes and the PDF route; optionally a global cap on sessions; keep the demo short-lived and monitor the database size. Railway-side protections: CONFIG-DEPENDENT.
- **Status:** VERIFIED (absence of controls; growth not exercised beyond a few requests).

### SEC-04 — Security headers missing; framework fingerprint exposed
- **Severity:** Low
- **Component:** `next.config.ts` (no `headers()`, no `poweredByHeader: false`)
- **Evidence:** `curl -I /discovery` returns `X-Powered-By: Next.js` and no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` or `Strict-Transport-Security`.
- **Scenario:** the app can be framed (clickjacking of e.g. delete-confirm dialogs); MIME sniffing not disabled; fingerprinting eases targeting of future Next.js CVEs.
- **Impact:** low (no auth, no XSS sinks found), but cheap defence-in-depth.
- **Remediation (compatible with Next.js, Cache Components and PPR):** add via `headers()` for `/:path*`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` plus `Content-Security-Policy: frame-ancestors 'none'`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`; set `poweredByHeader: false`. Leave a full script CSP out for now (Next.js inline bootstrap scripts need nonces, which conflict with static/partial prerendering) or ship it as `Content-Security-Policy-Report-Only` first. HSTS: Railway terminates TLS; add `Strict-Transport-Security` only once the final domain is known.
- **Status:** VERIFIED.

### SEC-05 — Docker migrator stage installs Prisma outside the lockfile
- **Severity:** Low
- **Component:** `Dockerfile:41-45` (`npm install prisma@<version>` in an empty project); base image `Dockerfile:9`
- **Evidence:** the Prisma version matches the lockfile, but its ~126 transitive packages are resolved fresh at build time (no lockfile) and are not covered by `npm audit` of this repo; `node:24.22.1-bookworm-slim` is pinned by tag, not digest.
- **Scenario:** a compromised or broken transitive release published between builds is pulled into the image that runs `migrate deploy` with database credentials.
- **Impact:** supply-chain integrity; build reproducibility.
- **Remediation:** copy `node_modules/prisma` and its dependencies from the `deps` stage (installed with `npm ci`), or create a small committed `package-lock.json` for the migrator; optionally pin the base image by digest.
- **Status:** STATIC.

### SEC-06 — Runtime application files are writable by the runtime user
- **Severity:** Low
- **Component:** `Dockerfile:56-58` (`COPY --chown=node:node`)
- **Evidence:** in `dora:local`, `/app/server.js`, `/app/.next.nosync/**`, `/app/public` are owned by `node`, the user the server runs as. (`/app/migrate` and the entrypoint are root-owned — good.)
- **Scenario:** after any code-execution bug, an attacker can modify server code for the container's lifetime.
- **Impact:** low; containers are ephemeral.
- **Remediation:** copy without `--chown` (root-owned, world-readable). Next.js writes its ISR/image cache under `.next.nosync/cache`; if needed create only that directory owned by `node`.
- **Status:** VERIFIED (ownership); impact STATIC.

### SEC-07 — Full Prisma errors written to logs
- **Severity:** Low / Informational
- **Component:** `src/server/api/http.ts:68,71`
- **Evidence:** unexpected and database errors are logged with `console.error(error)`, including Prisma's invocation text (observed in the DB-down run). Credentials were **not** logged (dummy password absent from logs). Prisma validation errors can include query arguments, i.e. user-entered text.
- **Impact:** user content may appear in Railway logs; acceptable for fictional demo data.
- **Remediation:** none required for the demo; if real data is ever used, log error code/name/message only.
- **Status:** VERIFIED (no credentials); argument logging STATIC.

### SEC-08 — Production dependency hygiene
- **Severity:** Informational
- **Evidence:** `shadcn` (CLI, 278 packages incl. transitive) is a production dependency (`package.json:32`) but is only used for `@import "shadcn/tailwind.css"` at build time; it is **not** in the standalone runtime image (verified). `eslint@9` is deprecated (dev only). Four packages run install scripts (expected: Prisma engines, fsevents, unrs-resolver).
- **Remediation:** move `shadcn` to `devDependencies` (the Docker `deps` stage installs dev dependencies anyway); plan the ESLint 10 upgrade separately. Apply the React 19.3.1 patch after reading its changelog (no advisory found).
- **Status:** VERIFIED.

### SEC-09 — Checked and not found (informational)
| Check | Result | Status |
| --- | --- | --- |
| SQL injection / unsafe dynamic queries | Only Prisma query API and tagged-template `$queryRaw` (`brd-service.ts:157-158`, `health/route.ts:12`) — parameterised; IDs validated as CUID before use (`chat-schemas.ts:13-15`); `x' or 1=1--` → 400 | VERIFIED |
| Mass assignment | All body schemas `.strict()`; `{"scenario":…}` and `{"__proto__":…}` → 400; services write explicit columns only | VERIFIED |
| Malformed JSON / wrong content type / deep nesting | 400 `INVALID_JSON`, 415, 400 (200k-level nested array parsed and rejected in 30 ms) | VERIFIED |
| HTTP methods | Unsupported → 405; `OPTIONS` → 204 with `Allow`, no CORS headers (cross-origin reads blocked) | VERIFIED |
| Information disclosure | Errors are `{error:{code,message}}` without stacks; `processingToken`, `clientRequestId`, `sequence` never serialised (`serializers.ts:8-36`); no env values in responses; no `NEXT_PUBLIC_*` variables | VERIFIED / STATIC |
| XSS | No `dangerouslySetInnerHTML`/`innerHTML`/`eval`; messages and BRD text rendered as React text (`message-bubble.tsx:34,61`); links built from server CUIDs | STATIC |
| PDF injection / header injection | Title `<script>alert(1)</script> «Ünïcödé» 📄` → safe `Content-Disposition` (ASCII fallback + RFC 5987, `pdf/route.ts:10-13`); PDFKit escapes text | VERIFIED |
| Redirects | Only internal constant/ID-based routes; unsaved-changes guard ignores other origins (`use-unsaved-changes-guard.tsx:43`) | STATIC |
| Client/server boundary | No client component imports `@/server/*` or the Prisma client | STATIC |
| CSRF | JSON content-type requirement forces a CORS preflight for writes with a body; `DELETE` needs preflight; body-less `POST /api/brds/[id]/regenerate` could be triggered by a cross-site form (fills only empty fields — harmless). Moot without auth (SEC-01). | STATIC |
| Real AI / external inference | No AI SDKs or outbound calls in `src/`; runtime makes no external requests (build fetches Google Fonts via `next/font/google`) | STATIC |

## 5. Reliability & Health Findings

### REL-01 — PDF rendering blocks the event loop
- **Severity:** Medium (combined with SEC-03); Low for a controlled demo
- **Component:** `renderBrdPdf` (`src/server/pdf/brd-pdf.ts:215-248`), `GET /api/brds/[id]/pdf` (`src/app/api/brds/[id]/pdf/route.ts:20`)
- **Evidence:** BRD with all 18 fields at 4,000 chars: 0.09 s (words), 0.22–0.33 s (many short lines, 855 kB PDF), **0.49–0.52 s** (unbroken tokens) per request. With 8 parallel worst-case requests, responses took 0.65–2.5 s and `/api/health` took **0.77 s** (normally ms). PDFKit layout is synchronous; no caching.
- **Scenario:** repeated PDF requests (cheap `GET`) stall every other request on the single Node.js process.
- **Remediation:** rate-limit the PDF route (SEC-03); optionally cache the rendered PDF keyed by BRD id + `updatedAt`, or cap concurrent renders.
- **Status:** VERIFIED (local Apple Silicon; Railway CPU likely slower — CONFIG-DEPENDENT).

### REL-02 — Health endpoint returns 500 instead of 503 when PostgreSQL is unreachable
- **Severity:** Low
- **Component:** `src/app/api/health/route.ts:12`, `isDatabaseUnavailableError` (`src/server/db/errors.ts:20-27`)
- **Evidence:** with an unreachable database, `$queryRaw` fails with `PrismaClientKnownRequestError` code **`P2010`** (`driverAdapterError: DatabaseNotReachable`), which is neither `P1xxx` nor a socket code → mapped to `500 INTERNAL_ERROR` and logged as "unexpected error". `findMany`-based routes correctly return 503. The error response also lacks `Cache-Control: no-store`. `health.db.test.ts` covers only the success path. `RAILWAY_DEPLOYMENT.md` and the route comment promise 503.
- **Impact:** health checks still fail correctly (non-2xx), so readiness gating works; status code, log classification and documentation are wrong.
- **Remediation:** also treat driver-adapter "not reachable" errors (e.g. `P2010` with `meta.driverAdapterError` of kind `DatabaseNotReachable`) as unavailable, or catch in the health route and return 503 explicitly; add a test with an unreachable URL.
- **Status:** VERIFIED.

### REL-03 — Quadratic regex in the Mock AI field rules
- **Severity:** Low
- **Component:** `dataElements` pattern `/[^,]+,[^,]+/u` (`src/lib/mock-ai/config/fields.ts:213`)
- **Evidence:** ~30 ms per 4,000-char comma-free answer when DORA is asking for data elements (isolated: 29.8 ms). All other adversarial inputs < 4 ms per turn. First call per process ≈ 100–200 ms while V8 compiles the large alias alternations. Bounded by the 4,000-char limit, so not a ReDoS in the catastrophic sense.
- **Remediation:** replace with a linear check (e.g. `text.includes(",")` plus non-empty parts), optionally warm the engine at startup.
- **Status:** VERIFIED.

### REL-04 — No client or database timeouts configured
- **Severity:** Low
- **Component:** `src/lib/api/client.ts:56-60` (`fetch` without `AbortSignal`); `src/server/db/client.ts:13-16` (`PrismaPg` with defaults)
- **Evidence:** a hung server leaves the composer in "Sending…" until the browser gives up; pool size, connect timeout and statement timeout use driver defaults. Interactive transactions use Prisma's default timeouts; the simulated delay runs outside transactions (verified by tests).
- **Remediation:** optional `AbortSignal.timeout(…)` on client requests (the UI already supports retry); optional explicit `connectionTimeoutMillis`/pool `max` for Railway.
- **Status:** STATIC; defaults CONFIG-DEPENDENT.

### REL-05 — Unbounded lists and conversations
- **Severity:** Low (known L8)
- **Component:** `listSessions`, `listBrds`, `getSessionDetail` (all messages returned)
- **Scenario:** with many sessions or very long conversations, responses and sidebar rendering grow without limit (also feeds SEC-03).
- **Remediation:** pagination or a hard cap if the demo outlives its intended size.
- **Status:** STATIC.

### REL-06 — Container start/stop behaviour
- **Severity:** Informational
- **Evidence:** `docker/entrypoint.sh:14-27`: migrations run before `exec node server.js` (`set -eu` → no server on failure; verified in Phase 12). During migrations `sh` is PID 1 and ignores `SIGTERM`, so a stop then waits for the grace period. If PostgreSQL is down at boot the container exits and the restart policy retries (Railway retry limits: CONFIG-DEPENDENT). Migrations on every start are correct for one replica (N12).
- **Status:** STATIC (+ Phase 12 evidence).

### REL-07 — Health semantics
- **Severity:** Informational
- **Evidence:** one endpoint combines liveness and readiness (process up + `SELECT 1`). Adequate for one instance and Docker/Railway deploy gating. A DB outage makes the app "unhealthy" although pages still render — fine, because Compose healthchecks don't restart and Railway uses its healthcheck at deployment time (Railway behaviour: NOT VERIFIED).

### Mock AI & business-logic integrity (Part 8) — no defects found
| Check | Evidence | Status |
| --- | --- | --- |
| Determinism, no clock/random/I/O | `engine.ts` pure; `structuredClone` of input state; tests assert determinism | VERIFIED (tests) / STATIC |
| Mandatory XY validation | Initial request never fills validation fields (`engine.ts:232-237`) | VERIFIED (tests) |
| State transitions forward-only, bounded | `state-machine.ts:62-87`; clarifications capped by `MAX_CLARIFICATION_ATTEMPTS`, then SKIPPED (`engine.ts:93-98`) → no infinite loop | VERIFIED (tests) |
| No silent overwrite | Plain statements never overwrite PROVIDED fields (conflict note instead, `engine.ts:68-76`); corrections need an explicit cue + field; ambiguous → no change | VERIFIED (tests) |
| No fabricated values | Values are the user's own words; BRD takes only PROVIDED fields (`generation.ts:36-44`) | VERIFIED (tests) |
| Completeness consistency | Central calculation; BRD status/completeness always derived from saved content | VERIFIED (tests) |
| Malformed stored state | Zod-validated on every read → `DataIntegrityError` (500), never partial writes | STATIC (+ known L2) |
| Long messages | 4,000-char adversarial inputs produce bounded replies (≤ 470 chars) in ≤ 30 ms | VERIFIED |
| Reload consistency | State fully persisted per turn; reload restores it | VERIFIED (tests, Phase 12 browser runs) |
| Known limitations (accepted) | L6 length-based fallback acceptance, L7 role change applies from next reply, N2 regeneration never refreshes non-empty generated fields | documented |

### BRD & PDF integrity (Part 9) — no defects found
- Missing values stay `null` → "Not specified"; status `READY_FOR_REVIEW` only with 18/18 fields (`generation.ts:55-59`). VERIFIED (tests).
- Manual edits survive regeneration: only `null` fields are filled (`editing.ts:55-74`). VERIFIED (tests).
- Concurrent save/regenerate serialised with `SELECT … FOR UPDATE` (`brd-service.ts:156-161`); concurrent generation yields one BRD (unique `sessionId`). VERIFIED (tests). Two editor tabs editing the *same* field remain last-write-wins (known N3).
- PDF is rendered from `getBrdDetail` (saved content) only. STATIC + tests.
- Memory is bounded by the field limits (largest observed PDF 855 kB); CPU is the constraint (REL-01).
- Render errors propagate to `withErrorHandling` → JSON 500; the stream `error` event rejects the promise (`brd-pdf.ts:231-235`). STATIC.

## 6. Docker Security Assessment

| Requirement | Result | Status |
| --- | --- | --- |
| Non-root runtime user | `USER node` (uid 1000) | VERIFIED |
| No secrets in image / build context | `.env*`, `*.pem`, `*.key` excluded (`.dockerignore:8-12`); `find` in image: none | VERIFIED |
| PostgreSQL not bundled | Only the app; DB is a separate Compose service / Railway service | VERIFIED |
| Dev dependencies not at runtime | Standalone output: 41 traced packages (51 MB), no eslint/vitest/typescript/shadcn | VERIFIED |
| Network exposure | Only port 3000 (`EXPOSE`); Compose binds the DB to `127.0.0.1` only (`compose.yaml:22`) | VERIFIED |
| Migrations fail safely; server only after success | `set -eu` + sequential commands (`entrypoint.sh:7,14-27`) | STATIC (+ Phase 12 VERIFIED) |
| Migrations never during build | No DB contact in build stages | STATIC |
| `.next.nosync` distDir | Standalone server and `static/` copied to the matching paths (`Dockerfile:56-57`); fonts traced via `outputFileTracingIncludes` | VERIFIED (image contents) |
| Base image | Debian bookworm-slim, Node 24 LTS; OpenSSL + CA certs only; tag-pinned, not digest | STATIC (SEC-05) |
| Image size | 773 MB, of which 256 MB Prisma CLI for `migrate deploy` (N11) | VERIFIED |
| File ownership | App files writable by runtime user (SEC-06) | VERIFIED |
| Health check | In `compose.yaml` (Node `fetch`); none in the Dockerfile (Railway uses its own) | STATIC |
| Signal handling | `exec node server.js` (Next.js handles SIGTERM; Phase 12: stop in 3–4 s); `sh` during migrations ignores SIGTERM (REL-06) | STATIC |
| Restart behaviour | Compose `unless-stopped`; Railway policy CONFIG-DEPENDENT | STATIC |
| Compose credentials | Throwaway local values, documented as such | STATIC |
| Migrator supply chain | Outside lockfile (SEC-05) | STATIC |

## 7. PostgreSQL & Prisma Assessment

| Check | Result | Status |
| --- | --- | --- |
| `DATABASE_URL` handling | Read from env only; lazy client; missing → clear error / 503; never logged (dummy password absent from logs) | VERIFIED |
| Hard-coded production credentials | None in tracked files or history | VERIFIED |
| Query safety | Prisma API + parameterised `$queryRaw` only | STATIC |
| Transactions | First turn, subsequent turn, BRD create/save/regenerate in single transactions; simulated delay outside any transaction | VERIFIED (tests) |
| Races | Processing lock (atomic `updateMany`, 30 s stale timeout, delay ≤ 5 s) prevents overlapping turns — 3 parallel messages → 1×201, 2×409; idempotency via unique `clientRequestId`; BRD row lock | VERIFIED (curl + tests) |
| Constraints | Unique `RequirementState.sessionId`, `BusinessRequirementsDocument.sessionId`, `Message.clientRequestId`; CHECKs on completeness (0–100), settings singleton and delay (0–5000) | VERIFIED (migrations) |
| Foreign keys / cascade | `ON DELETE CASCADE` from `ChatSession` to all children | VERIFIED (migrations, tests) |
| Migration safety | Additive DDL; only data change is the documented clamp `UPDATE … SET 5000 WHERE > 5000`; one idempotent settings `INSERT … ON CONFLICT DO NOTHING`; no reset/seed/`db push` anywhere; no drift | VERIFIED |
| Error handling | Unique/FK/not-found mapped to 200-replay/404; corrupt JSON → 500 `DataIntegrityError`; connection errors → 503 except health (REL-02) | VERIFIED |
| Connection management | One cached `PrismaClient`/pg pool per process (driver default pool size); no long-held connections | STATIC; pool sizing CONFIG-DEPENDENT |
| Connection exhaustion | Unlikely for one instance (default pool far below PostgreSQL's default limit); requests queue under heavy load | STATIC |
| Duplicate processing | Replays return the stored exchange (200, `Idempotent-Replayed: true`) | VERIFIED (tests) |
| Persistence after restart | Data in PostgreSQL only; verified across container restart in Phase 12 | Phase 12 VERIFIED; not re-run |
| Data loss/corruption under normal concurrency | None identified; last-write-wins only for the same BRD field in two tabs (N3) | STATIC + tests |

## 8. API Security Assessment

| Route | Methods | Validation | Notes |
| --- | --- | --- | --- |
| `/api/chats` | GET, POST | strict body: content 1–4000 (trimmed), UUID `clientRequestId`, optional role enum | GET exposes all sessions (SEC-01); POST idempotent |
| `/api/chats/[id]` | GET, PATCH, DELETE | CUID id; title 1–120 (whitespace-normalised), role enum | DELETE cascades; no confirmation server-side (UI confirms) |
| `/api/chats/[id]/messages` | POST | CUID + strict body | lock → 409 `SESSION_BUSY`; idempotent replay |
| `/api/chats/[id]/requirements` | GET | CUID | |
| `/api/chats/[id]/brd` | POST | strict `{allowIncomplete?: boolean}` | 409 without consent; 201/200 |
| `/api/brds` | GET | — | lists all BRDs (SEC-01) |
| `/api/brds/[id]` | GET, PATCH | CUID; known field keys only, ≤ 4000 chars each, title 1–200 | row-locked |
| `/api/brds/[id]/regenerate` | POST | CUID, no body | fills empty fields only |
| `/api/brds/[id]/pdf` | GET | CUID | `no-store`, safe filename; CPU cost (REL-01) |
| `/api/settings` | GET, PATCH | role enum, integer delay 0–5000, at least one key | global, unauthenticated (SEC-01) |
| `/api/health` | GET | — | `no-store`; 500 instead of 503 on outage (REL-02) |

Cross-cutting: consistent JSON errors, no stack traces, 405 for unsupported methods, 415 for
non-JSON writes, 400 for malformed JSON — all VERIFIED. Gaps: no body size limit (SEC-02), no rate
limiting (SEC-03), no access control (SEC-01). Unknown `/api/*` paths return the HTML 404 page
(cosmetic).

## 9. Railway Deployment Readiness

| Item | Assessment | Status |
| --- | --- | --- |
| Dynamic `PORT`, bind `0.0.0.0` | Entrypoint exports `PORT` (default 3000) and pins `HOSTNAME=0.0.0.0` | STATIC (+ Phase 12 VERIFIED) |
| `DATABASE_URL` | Reference variable `${{Postgres.DATABASE_URL}}`; private network without SSL documented. If the public proxy URL is used instead, SSL/`sslmode` may be required | CONFIG-DEPENDENT |
| Build | Dockerfile builder; no DB needed at build; needs outbound access to npm and Google Fonts (`next/font/google`) | STATIC |
| Start | Entrypoint (migrate → server); "Custom Start Command" must stay empty (documented). Note: differs from `MASTER_SPEC.md` §2 start command by design | STATIC |
| Health check | `/api/health` gates traffic after migrations; returns non-2xx on DB outage (500, REL-02) | VERIFIED locally |
| Migration strategy | `migrate deploy` on every start (single replica) or pre-deploy command + `RUN_MIGRATIONS=false` | STATIC |
| Restart / persistence | Stateless container; all data in the Railway PostgreSQL volume | STATIC |
| Logging | Plain `console.error` lines with `[api]` prefix and Prisma errors; no request IDs; no credentials | VERIFIED |
| Memory | No body cap (SEC-02) and no `--max-old-space-size`; plan RAM determines OOM threshold | CONFIG-DEPENDENT |
| Risks only visible after deployment | Railway CPU speed vs. PDF cost; Railway PostgreSQL major version; healthcheck timeout vs. first-start migration time; restart-retry limit when DB starts after the app; public discovery of the URL by crawlers (SEC-01) | NOT VERIFIED |

## 10. Dependency Vulnerabilities

- **Known vulnerabilities:** none (`npm audit` and `npm audit --omit=dev`: 0), registry signatures verified for all 844 packages.
- **Production-relevant runtime:** Next.js 16.4.3, React 19.3.0, Prisma Client / adapter-pg 7.10.1, PDFKit 0.20.x, Zod 4.6.x, Radix UI, lucide-react — mutually compatible (build, tests and container verified); Node 24 LTS matches `engines`, `.nvmrc` and the Docker base image.
- **Not covered by this audit's `npm audit`:** the Prisma CLI tree installed in the Docker migrator stage without a lockfile (SEC-05).
- **Development-only:** `eslint@9` deprecated; `typescript` 7 / `eslint` 10 majors available — no security impact on the running app.
- **Pending patches:** `react`/`react-dom` 19.3.1 (no advisory found), `pdfjs-dist` 6.4.299 (dev).
- **Unnecessary production dependency:** `shadcn` CLI (SEC-08), build-time only.
- **Scripts:** `postinstall: prisma generate` (expected); `start` runs `prisma migrate deploy` (non-Docker path needs the dev-dependency Prisma CLI — known H3). No unsafe scripts found.
- **Reproducibility:** `npm ci` succeeds from the committed lockfile without changes.

## 11. Prioritized Remediation Plan

**Must fix before public (unrestricted) deployment**
1. **SEC-01** — gate the app (shared-secret Basic Auth in `proxy.ts` or platform restriction), or limit exposure to a controlled audience with fictional data and a visible notice.
2. **SEC-02** — cap request body size in `parseJsonBody` (413 above ~1 MB).
3. **SEC-03 / REL-01** — basic per-IP rate limiting for write routes and the PDF route.

For a *controlled* demo, items 1 and 3 can be accepted risks; item 2 is cheap and recommended even then.

**Should fix**
4. **REL-02** — return 503 from `/api/health` on driver-adapter connection errors; add a negative test; keep docs accurate.
5. **SEC-04** — minimal security headers and `poweredByHeader: false`.
6. **SEC-05** — install the migrator's Prisma CLI from the lockfile.
7. **SEC-06** — root-owned application files in the runtime image.

**Optional improvements**
8. **REL-03** — linear replacement for the `dataElements` comma pattern.
9. **REL-04** — client request timeouts; explicit pool/connect timeouts.
10. **SEC-08** — move `shadcn` to devDependencies; apply React 19.3.1 after changelog review; plan ESLint 10.
11. **REL-05** — pagination/caps for lists and conversations; database-size monitoring on Railway.
12. **SEC-07** — reduce logged error detail if real data is ever processed.

## 12. Final Verdict

**READY WITH ACCEPTED RISKS**

Evidence for readiness: all automated checks pass (typecheck, lint, 176 unit, 79 integration tests,
build, schema validation, no drift); input validation is strict and verified against malformed,
oversized-field, mass-assignment and injection probes; persistence is transactional with verified
locking and idempotency; migrations are additive and never reset or seed; the Docker image runs as
non-root without secrets or dev tooling; no secrets exist in the repository or its history; no known
dependency vulnerabilities.

Accepted risks for a controlled educational deployment (known audience, fictional data, short-lived,
owner-monitored): open read/write/delete access to all data and shared settings (SEC-01), no rate
limiting (SEC-03), event-loop blocking by PDF rendering (REL-01), and the remaining Low findings.

This verdict does **not** cover unrestricted public exposure: an anonymous visitor can delete all
data, and a single client can exhaust memory (SEC-02) or CPU (REL-01). Those scenarios require the
"Must fix" items above. Railway-specific behaviour remains NOT VERIFIED until the owner's manual
deployment.
