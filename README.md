# DORA — Requirements Discovery Tool

An educational MVP in which **DORA** (Discovery-Oriented Requirements Assistant) guides business
stakeholders through a structured conversation and produces an editable Business Requirements
Document (BRD).

DORA is a **deterministic, rule-based mock assistant**. It does not call any LLM or external AI
service, and needs no AI API keys. The full product and technical specification is in
[`MASTER_SPEC.md`](MASTER_SPEC.md).

> Educational prototype with fictional demonstration data — not a production Telekom AS service.

## Status

The application is built in phases. Implemented so far:

- **Phase 01 — Project Foundation:** Next.js (App Router), strict TypeScript, Tailwind CSS,
  shadcn/ui, Lucide icons, light theme tokens, root layout and entry page.
- **Phase 02 — Database and Prisma:** PostgreSQL schema, initial migration, shared database
  client, settings initialization, requirement field catalog and JSON validation schemas.
- **Phase 03 — Application Shell:** desktop-first layout with sidebar navigation (New Discovery,
  Discovery Sessions, BRD Documents, Settings), reusable page header, empty, loading and
  confirmation dialog components, and page shells for `/discovery`, `/brds` and `/settings`.

- **Phase 04 — Sessions and Message Persistence:** session API (list, detail, create from the
  first message, rename, delete), transactional persistence services for messages, idempotent
  first-message submission, consistent JSON errors.

- **Phase 05 — Deterministic Mock AI Engine:** rule-based discovery engine in
  `src/lib/mock-ai/` (classification, extraction, state machine, roles, templates, progress).

- **Phase 06 — Functional Discovery Chat:** chat UI connected to the Mock AI engine; first
  message creates the session; transactional persistence of each exchange; simulated typing
  delay; overlap and duplicate protection; retry; sidebar session list with rename and delete.

- **Phase 07 — Discovery Progress and Assistant Roles:** progress panel (completeness, six
  stages, status of all 18 fields), role dropdown in the chat header with per-session role
  persistence, `GET /api/chats/[id]/requirements`, read-only `GET /api/settings`.

- **Phase 08 — BRD Generation:** BRD generated from structured requirements (seven sections,
  18 fields, "Not specified" for missing values), Draft / Ready for Review status, missing-field
  warning with explicit draft consent, one BRD per session, BRD list/create/detail APIs,
  read-only BRD page, BRD lists in the sidebar and on `/brds`, DORA's BRD suggestion.

- **Phase 09 — BRD Editor and Regeneration:** editable BRD page (title and all 18 fields),
  explicit Save Changes, unsaved-change indicators and navigation warning, manual-edit tracking,
  `PATCH /api/brds/[id]`, `POST /api/brds/[id]/regenerate` (manual edits preserved, only empty
  fields filled, same BRD id), status and completeness recalculated from the saved content.

- **Phase 10 — PDF Export:** `GET /api/brds/[id]/pdf` renders the saved BRD (manual edits
  included) on the server with PDFKit; Export PDF button in the BRD editor.

- **Phase 11 — Settings and UX Polish:** Settings page and `PATCH /api/settings` (default
  assistant role, simulated delay 0–5000 ms), accessibility review (axe-core: contrast, headings,
  keyboard access to scrollable areas, skip link), consistent empty/error states, no remaining
  placeholders.

- **Phase 12 — Verification and Deployment Preparation:** full verification (acceptance
  scenarios A–H, PostgreSQL 14 and 17), production Docker image (multi-stage, Next.js standalone,
  non-root, migrations before start), `compose.yaml` for local testing, `GET /api/health`,
  manual Railway guide in [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md).

The application has **not** been deployed to Railway yet; deployment is a manual step (see the
guide).

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4, shadcn/ui (Radix, "nova" style) |
| Icons | Lucide React |
| Database | PostgreSQL, Prisma ORM 7 (`prisma-client` generator, `@prisma/adapter-pg`) |
| Validation | Zod 4 |
| Tests | Vitest |
| Linting | ESLint 9 with `eslint-config-next` |
| PDF | PDFKit (server-side, pure JavaScript — no headless browser), Geist font (SIL OFL, vendored in `assets/fonts/geist/`) |

## Prerequisites

- Node.js **24** (`.nvmrc` pins 24.22.1; `engines` requires `>=24 <25`)
- npm 11
- PostgreSQL 14 or newer (local install or Docker)

## Local setup

```bash
nvm use                 # optional, picks up .nvmrc
npm install             # also generates the Prisma client (postinstall)
cp .env.example .env    # then set DATABASE_URL (and TEST_DATABASE_URL for db tests)
npm run db:migrate      # apply migrations to the development database
npm run dev
```

Open <http://localhost:3000>.

A disposable PostgreSQL via Docker, if you have no local server:

```bash
docker run --name dora-postgres -e POSTGRES_USER=dora -e POSTGRES_PASSWORD=dora \
  -e POSTGRES_DB=dora -p 5432:5432 -d postgres:17
docker exec dora-postgres createdb -U dora dora_test
# DATABASE_URL="postgresql://dora:dora@localhost:5432/dora?schema=public"
# TEST_DATABASE_URL="postgresql://dora:dora@localhost:5432/dora_test?schema=public"
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | `prisma generate && next build` |
| `npm start` | `prisma migrate deploy && next start` (runs the build without Docker; respects `PORT`) |
| `npm run typecheck` | Generate Next.js route types, then run `tsc --noEmit` |
| `npm run lint` | Run ESLint |
| `npm run check` | Typecheck + lint |
| `npm test` | Unit tests (no database needed) |
| `npm run test:db` | Database integration tests against `TEST_DATABASE_URL` (migrates it first) |
| `npm run test:all` | All tests |
| `npm run db:migrate` | Create/apply migrations in development (`prisma migrate dev`) |
| `npm run db:deploy` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:validate` | Validate `prisma/schema.prisma` |
| `npm run db:studio` | Open Prisma Studio |

## Environment variables

See [`.env.example`](.env.example). `.env` and other `.env*` files are git-ignored; only
`.env.example` is committed.

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | App, Prisma CLI | **Required.** PostgreSQL connection string. Railway: `${{Postgres.DATABASE_URL}}` |
| `TEST_DATABASE_URL` | `npm run test:db` | Dedicated test database; must differ from `DATABASE_URL` |
| `PORT` | Server | Optional, default 3000; Railway injects it |
| `RUN_MIGRATIONS` | Docker entrypoint | Optional, default `true`; `false` skips `prisma migrate deploy` at container start |
| `DORA_PORT`, `DORA_DB_PORT` | `compose.yaml` | Optional host ports for local Docker Compose (defaults 3000, 5433) |

No AI/LLM keys exist or are needed.

## Docker

The production image is defined in [`Dockerfile`](Dockerfile) (multi-stage, Node.js 24 LTS on
Debian bookworm-slim):

| Stage | Purpose |
| --- | --- |
| `deps` | `npm ci` from the lockfile (`postinstall` generates the Prisma client) |
| `builder` | `next build` with `NEXT_OUTPUT=standalone` (minimal `server.js` + traced dependencies, incl. Prisma Client, PDFKit and `assets/fonts`) — no database contacted |
| `migrator` | Prisma CLI (lockfile version) + `prisma/` schema, migrations and `prisma.config.ts` |
| `runner` | Final image: standalone server, static assets, migrator, entrypoint; runs as user `node` |

**Start sequence** ([`docker/entrypoint.sh`](docker/entrypoint.sh)): require `DATABASE_URL` →
`prisma migrate deploy` → `node server.js` on `0.0.0.0:$PORT`. The server starts only after the
migrations succeeded; on failure the container exits non-zero. Migrations never run during the
image build, and nothing is reset or seeded. The image contains no PostgreSQL and no `.env`
files (`.dockerignore`). Health check: `GET /api/health`.

```bash
docker build -t dora .
docker run --rm -p 3000:3000 -e DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/dora" dora
```

Image size is about 770 MB uncompressed: ~60 MB application, ~250 MB Prisma CLI (needed for
`migrate deploy` at start), the rest is the Node.js base image.

### Local Docker Compose

[`compose.yaml`](compose.yaml) starts the app with PostgreSQL 17 and a persistent volume — for
local testing only (production does not use Compose):

```bash
docker compose up --build      # http://localhost:3000 (DORA_PORT to change)
docker compose logs -f app     # migration and server logs
docker compose down            # stop; data stays in the dora-db volume
docker compose down -v         # stop and delete the local database
```

The database is reachable from the host on `127.0.0.1:5433` (user `dora`, password
`dora-local-only`, database `dora` — local throwaway credentials).

## Deployment (Railway)

Manual deployment of the Docker image with a Railway PostgreSQL service is described step by
step in [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md): project and database setup,
`DATABASE_URL=${{Postgres.DATABASE_URL}}`, domain, health check `/api/health`, migration
verification, logs and troubleshooting, redeploys and persistence checks.

## Database migrations

- Schema changes are made with new migrations in `prisma/migrations` (`npm run db:migrate`
  in development). Applied migrations are never edited.
- Production applies them with `prisma migrate deploy` — automatically at container start
  (Docker/Railway) or via `npm run db:deploy` / `npm start` without Docker. `prisma db push`
  is not used.
- Four migrations exist: initial schema (incl. the single settings row), sessions/messages,
  discovery chat fields, settings delay bounds (CHECK 0–5000 ms).

## Testing

| Command | Scope |
| --- | --- |
| `npm run check` | TypeScript (strict) + ESLint |
| `npm test` | Unit tests: classification, XY validation, extraction, state machine, clarification/skip, corrections, roles, completeness, BRD generation/editing/regeneration, PDF rendering (text extracted with pdf.js) |
| `npm run test:db` | Integration tests against a real PostgreSQL (`TEST_DATABASE_URL`): all API routes, persistence, idempotency, locking, cascade deletion, BRD save/regenerate concurrency, PDF download, settings |
| `npm run build` | Production build |
| `npm run db:validate` | Prisma schema validation |

The database tests migrate the test database first and delete only the records they create
(shared settings are restored). Browser-level checks of the acceptance scenarios were run
manually with Playwright during development; those scripts are not part of the repository.

## Project structure

```
src/
  app/              Routes, root layout, global styles (theme tokens in globals.css)
    (app)/          Route group rendered inside the application shell
    api/            Route handlers (thin: validate → call service → serialize)
  components/
    common/         Reusable page building blocks (PageHeader, PageContent, EmptyState,
                    LoadingState, ConfirmDialog)
    brds/           BRD list, editor, status badge, sidebar list, BRD list state
    discovery/      Chat view, message bubbles, typing indicator, composer, progress, BRD action
    sessions/       Session list state (provider), sidebar list, rename dialog
    settings/       Settings page (load, form, validation)
    layout/         Application shell and sidebar
    ui/             shadcn/ui primitives (generated via `npx shadcn add <component>`)
  config/           Static app constants (names, navigation routes)
  hooks/            Client hooks (use-discovery-chat: sending, retry, one message at a time; use-unsaved-changes-guard)
  generated/prisma/ Generated Prisma client (git-ignored; rebuilt by `prisma generate`)
  lib/              Framework-agnostic code (utils.ts → `cn` class merging)
    api/            Request schemas (Zod) and response types for the API
    mock-ai/        Deterministic rule-based discovery engine (see "Mock AI architecture")
    brd/            BRD generation, editing and regeneration rules (content, status, completeness)
    requirements/   Catalog of the 7 BRD sections / 18 fields, statuses, Zod schemas, completeness
    sessions/       Deterministic session title derivation
    settings/       Settings bounds (delay range, default)
  server/           Server-only code
    api/            HTTP helpers: JSON body parsing, consistent error responses
    db/             Shared Prisma client, settings initialization, Prisma error helpers
    brds/           BRD persistence (generate once per session, list, detail, save, regenerate)
    discovery/      Discovery service: engine + simulated delay + transactional persistence
    sessions/       Session/message persistence services, processing lock
    pdf/            BRD PDF rendering (PDFKit)
assets/fonts/       Fonts embedded in generated PDFs (Geist, SIL Open Font License)
prisma/
  schema.prisma     Data model
  migrations/       SQL migrations (committed)
tests/              Vitest setup for database integration tests, PDF text extraction helper (pdf.js)
docker/             Container entrypoint (migrations, then server)
Dockerfile          Production image; compose.yaml: local app + PostgreSQL
```

Business logic stays out of React components: domain rules live in `src/lib/`, persistence
and PDF rendering in `src/server/`.

## Data model

Defined in [`prisma/schema.prisma`](prisma/schema.prisma) (MASTER_SPEC §5, §7).

| Model | Purpose | Relationship |
| --- | --- | --- |
| `ChatSession` | Title, scenario, assistant role, current discovery stage | Root of a session |
| `Message` | User and DORA messages | Many per session, cascade delete |
| `RequirementState` | Structured requirements, independent of message history | One per session (unique), cascade delete |
| `BusinessRequirementsDocument` | BRD title, status, content, manual edit metadata | One per session (unique), cascade delete |
| `AppSettings` | Simulated response delay, default assistant role | Single shared record (`id = 1`) |

Enums: `Scenario`, `AssistantRole`, `DiscoveryStage`, `MessageRole`, `DocumentStatus`.

**Requirement fields.** The 18 fields of the seven BRD sections are defined once in
[`src/lib/requirements/fields.ts`](src/lib/requirements/fields.ts). `RequirementState.fields`
is a JSON map holding, for every field, its `value`, its status (`MISSING`, `PROVIDED`,
`NEEDS_CLARIFICATION`, `SKIPPED`) and its `clarificationCount`. `currentField` records the field
DORA is currently asking about. BRD `content` maps every field to text or `null` ("Not
specified"); `manualEdits` lists the fields a user edited, with timestamps, so regeneration
can tell manual edits from generated content. All JSON columns are validated with the Zod
schemas in [`src/lib/requirements/schemas.ts`](src/lib/requirements/schemas.ts).

**Database constraints.** Foreign keys with `ON DELETE CASCADE`, unique `sessionId` on
`RequirementState` and BRD, indexes for session/BRD lists (`updatedAt`) and message history
(`sessionId, createdAt`). The initial migration also adds hand-written `CHECK` constraints
(completeness within 0–100, settings `id = 1`); a later migration bounds the simulated delay to
0–5000 ms.

**Settings initialization.** The initial migration inserts the single settings record with
defaults (1500 ms delay, Requirements Discovery Assistant), so it exists right after
`prisma migrate deploy`. `ensureAppSettings()` in
[`src/server/db/settings.ts`](src/server/db/settings.ts) recreates it if it is missing. No demo
sessions or BRDs are ever created.

## Mock AI architecture

DORA does **not** use an LLM or any external AI service. `src/lib/mock-ai/` is a deterministic,
rule-based engine with one entry point:

```ts
processTurn({ message, state, role }) → { state, reply, completenessPercentage, suggestBrd, events }
```

It is a pure function: no database, network, clock or randomness. The same message, state and
role always produce the same result. The API layer persists the returned state and reply.

| Module | Responsibility |
| --- | --- |
| `config/scenarios.ts` | Weighted keyword dictionaries per scenario, thresholds |
| `config/fields.ts` | Per-field evidence keywords/patterns, field name aliases, clarification limit |
| `config/intents.ts` | Skip, confirmation, non-answer and correction-cue patterns |
| `classification.ts` | Scores the initial request; negated keywords ignored; ties and weak matches → Generic |
| `solution-detection.ts` | XY-problem support: detects proposed solutions and solution-only answers |
| `extraction.ts` | Answer evaluation, explicit statements, explicit corrections |
| `state-machine.ts` | Six-stage state machine and next-field selection |
| `roles.ts` | Four role profiles: validation fields, question order, wording |
| `templates.ts` | All reply text, scenario-specific examples, review summary |
| `progress.ts` | Stage progress; completeness from `lib/requirements/progress.ts` |
| `engine.ts` | Orchestrates one turn |

**Scenarios.** Customer Churn, Sales Performance, Network Performance; a request is classified
only if a scenario scores at least 2 and leads the runner-up, otherwise Generic Analytics.

**Stages.** Stages only move forward:

1. *Initial Request* — classify the scenario, note a proposed solution (e.g. "customer churn
   dashboard") as context. Problem and objective fields are never taken from this message.
2. *Business Problem Validation* — mandatory for every role: the first question always asks
   for the business problem and the decision it supports. Answers that only describe a
   solution are rejected as problem or outcome. Default fields: problem statement and desired
   outcome; the XY-Problem Diagnostic role validates all five problem/objective fields.
3. *Requirements Discovery* — every remaining field is asked once, in role priority order.
   Unclear answers are marked *Needs Clarification* and deferred.
4. *Requirements Clarification* — deferred fields are asked again with a scenario-specific
   example. After at most 2 clarification questions an unclear field becomes *Skipped*.
5. *Requirements Review* — summary of all 18 fields; the user confirms or corrects.
6. *BRD Generation* — DORA suggests generating the BRD and lists incomplete fields.

**Extraction rules.** An answer to the expected field is recorded (status *Provided*, in the
user's own words) when it is not a non-answer ("not sure", "?") and contains field evidence
(e.g. a frequency for *usage frequency*, a system for *data sources*), or is long enough for
fields that allow it. Explicit statements with unambiguous field names ("The data source is
CRM", "Reporting period: last 24 months") fill other fields that are not yet provided. "skip"
skips the current field. Nothing is inferred beyond these rules.

**Corrections.** "Change the target users to …", "Actually, the KPI should be …" and "The data
source is not CRM; it is …" update exactly the named field. If no field or several fields are
named, or the new value is missing, DORA asks for clarification and changes nothing. A plain
statement never overwrites a provided field.

**Completeness** = Provided fields / 18 × 100, rounded (`calculateCompleteness`); Missing,
Needs Clarification and Skipped fields do not count.

**Roles** change question order and wording only — never the collected requirements:
Requirements Discovery (balanced, BRD order), XY-Problem Diagnostic (problem, motivation and
outcome first), Data Requirements Analyst (KPIs and data first, technical wording), BRD
Generator (BRD order with section and completeness progress).

## API

All bodies are JSON (`Content-Type: application/json`). Errors always have the shape
`{ "error": { "code", "message", "issues"? } }`.

| Method & path | Purpose | Success |
| --- | --- | --- |
| `GET /api/chats` | List sessions, most recently updated first | 200 `{ sessions }` |
| `POST /api/chats` | Start a session with the first user message; returns DORA's reply | 201 `{ session }` (200 on replay) |
| `POST /api/chats/[id]/messages` | Send a message; returns the stored message and DORA's reply | 201 `{ session, messages }` (200 on replay) |
| `GET /api/chats/[id]` | Session with messages in order, stage, role and completeness | 200 `{ session }` |
| `PATCH /api/chats/[id]` | Rename and/or change role: `{ "title"?, "assistantRole"? }` | 200 `{ session }` |
| `GET /api/chats/[id]/requirements` | Completeness, stages and status of all 18 fields | 200 `{ sessionId, requirements }` |
| `GET /api/health` | Health check: server running and PostgreSQL reachable | 200 `{ status, database }` / 503 |
| `GET /api/settings` | Default assistant role, simulated delay, last change | 200 `{ settings }` |
| `PATCH /api/settings` | Change settings: `{ "defaultAssistantRole"?, "mockResponseDelayMs"? }` (0–5000) | 200 `{ settings }` |
| `POST /api/chats/[id]/brd` | Generate the session's BRD: `{ "allowIncomplete"?: boolean }` | 201 `{ brd }`; 200 if it already exists |
| `GET /api/brds` | List BRDs, most recently updated first | 200 `{ brds }` |
| `GET /api/brds/[id]` | BRD with its seven sections | 200 `{ brd }` |
| `PATCH /api/brds/[id]` | Save manual edits: `{ "title"?, "content"?: { [fieldKey]: string \| null } }` | 200 `{ brd }` |
| `GET /api/brds/[id]/pdf` | Download the saved BRD as PDF (`attachment`) | 200 `application/pdf` |
| `POST /api/brds/[id]/regenerate` | Fill empty fields from the latest requirements (no body) | 200 `{ brd, filledFields }` |
| `DELETE /api/chats/[id]` | Delete session, messages, requirement state and BRD | 204 |

**Message flow.** `POST /api/chats` (first message, body `{ content, clientRequestId,
assistantRole? }`) and `POST /api/chats/[id]/messages` (body `{ content, clientRequestId }`):

1. Validate the request (Zod).
2. If `clientRequestId` was already stored, return that exchange (replay, status 200).
3. Subsequent messages only: acquire the session's processing lock (one atomic `UPDATE`);
   if another message is being processed, respond `409 SESSION_BUSY`.
4. Load and validate the stored discovery state; run the Mock AI engine (`processTurn`).
5. Wait the configured simulated delay (`AppSettings.mockResponseDelayMs`, default 1500 ms).
   No transaction is open during the wait.
6. In one transaction: store the user message, DORA's reply, the requirement state, stage and
   scenario, and release the lock. For the first message the session is created here too.

If anything fails, nothing is stored and the lock is released; the client keeps the message
as "Not sent" with Retry (same `clientRequestId`) and Discard. Opening New Discovery calls no
API, so no session exists before the first message is stored. A lock older than 30 s is
treated as abandoned.

**Idempotency.** The client generates one `clientRequestId` per message and reuses it on
retries. It is stored on the user message under a unique constraint, so repeated or concurrent
submissions are stored at most once; reusing a key for a different message returns 409.

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body or route parameter fails validation |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 404 | `NOT_FOUND` | Session or BRD does not exist |
| 405 | — | Unsupported method (handled by Next.js) |
| 409 | `IDEMPOTENCY_CONFLICT` | `clientRequestId` reused for a different message |
| 409 | `SESSION_BUSY` | Another message of the session is still being processed |
| 409 | `INCOMPLETE_REQUIREMENTS` | BRD requested with missing fields and without `allowIncomplete` (issues list the fields) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body is not `application/json` |
| 503 | `DATABASE_UNAVAILABLE` | Database not configured or unreachable |
| 500 | `INTERNAL_ERROR` | Anything else (details are logged, not returned) |

**Progress.** Session details and message responses include a `requirements` object built by
`buildRequirementsProgress()` (`src/lib/mock-ai/progress.ts`) from the stored field states:
completeness (Provided fields / 18), the six stages (completed / current / upcoming) and every
field with its status, value and whether DORA is currently asking for it. Message counts play
no role.

**Roles.** The role is stored per session (`ChatSession.assistantRole`). Changing it only
updates that column — messages, requirements and stage are untouched — and the engine uses the
stored role from the next message on. New sessions take the role chosen in the dropdown, or
the default role from the settings; changing the default never affects existing sessions.

## BRD generation

`src/lib/brd/generation.ts` builds the BRD from the session's structured requirement fields —
never from the chat transcript:

- A field's value is taken over only if its status is *Provided*; Missing, Skipped and Needs
  Clarification fields stay empty (`null`) and are displayed as **"Not specified"**. Nothing is
  filled in or invented.
- Status is **Ready for Review** only when all 18 fields have content, otherwise **Draft**.
  It describes completeness, not business approval.
- Generation is available at any stage once the session exists ("Generate BRD" in the chat
  header). With missing fields, a warning lists them; the user can continue the discovery or
  explicitly generate a draft. The API enforces the same rule (`allowIncomplete`).
- DORA suggests generating the BRD once the requirements review has been confirmed.
- Each session has at most one BRD (unique `sessionId`). Generating again — also concurrently
  — returns the existing BRD unchanged; updating it from newer requirements is the job of
  regeneration (below). Deleting the session deletes its BRD.

## BRD editing and regeneration

Rules in `src/lib/brd/editing.ts` (pure), persistence in `src/server/brds/brd-service.ts`.

- **Editor (`/brds/[id]`).** Title and every one of the 18 fields have their own input. Edits
  stay in the browser until **Save Changes**; only changed fields are sent. Changed fields show
  "Unsaved", the header counts unsaved changes, and **Discard** restores the saved content.
- **Leaving with unsaved changes.** In-app links open a "Discard unsaved changes?" dialog;
  reload, closing the tab and external links trigger the browser's leave prompt. Browser
  back/forward cannot be intercepted in the App Router — the page is kept hidden (Activity)
  and shows the unsaved changes again on return, as long as Next.js keeps it (up to 3 routes).
- **Saving.** Values are trimmed; an empty field is stored as `null` and shown as
  "Not specified". A field whose saved value changes is recorded in `manualEdits`
  (`{ editedAt }`) and shown as "Manually edited"; unchanged fields stay generated content.
  Status and completeness are recalculated from the saved content (clearing a field turns a
  Ready for Review BRD back into a Draft). A save without effective changes writes nothing.
- **Regeneration.** Works on the saved document, so it is disabled while there are unsaved
  changes, and asks for confirmation. Every field with content — manual edits and earlier
  generated text — is kept; only empty fields are filled, and only from requirements that are
  *Provided* in the session's latest state. A field the user cleared counts as empty and may be
  filled again (it is then generated content). The BRD keeps its id, title and creation date;
  status and completeness are recalculated. The response lists the filled fields, which the
  editor reports.
- **Concurrency.** Save and regenerate lock the BRD row (`SELECT … FOR UPDATE`) inside their
  transaction, so concurrent requests are applied one after another without losing edits.

## PDF export

`GET /api/brds/[id]/pdf` (Export PDF in the BRD editor) renders the **saved** BRD — including
manual edits — on the server with PDFKit (`src/server/pdf/brd-pdf.ts`). No browser screenshot
is involved. The editor disables Export PDF while there are unsaved changes, because they would
not be in the PDF.

- A4 layout: "Requirements Discovery Tool" title line, BRD title with a short magenta accent
  rule, document date (last saved, in UTC), created date, status, completeness and source
  session, a completeness note, then the seven sections with all 18 fields.
- Missing values are printed as an amber "Not specified — missing information" marker;
  manually edited fields carry a "Manually edited" note next to their label.
- Long values flow across pages; a field label is never separated from the start of its value,
  and a section heading never ends a page. Every page has a footer with the document title and
  "Page n of N". Section headings are also PDF bookmarks.
- Text uses the embedded Geist font (Latin, Latin Extended, Cyrillic and common symbols such
  as € – “ ” ≥ →). Characters the font does not contain (e.g. emoji, ✓) render as empty boxes.
- The download name is derived from the title (`BRD Churn analysis.pdf`), sent with an ASCII
  fallback and a UTF-8 `filename*`. Responses are `Cache-Control: no-store`.
- PDFKit is listed in `serverExternalPackages` (`next.config.ts`) because it reads data files from
  its package at runtime. Fonts are read from `assets/fonts/geist/` relative to the working
  directory, so the server must be started from the project root (as `npm start` does).

## Routes

| Route | Page |
| --- | --- |
| `/` | Redirects to `/discovery` |
| `/discovery` | New Discovery: empty chat; the session is created with the first message |
| `/discovery/[id]` | Continue a stored discovery session (history restored from the database) |
| `/brds` | BRD Documents (all BRDs with status and completeness) |
| `/brds/[id]` | BRD editor: Save Changes, Regenerate BRD, Export PDF, Back to Discovery |
| `/settings` | Settings: default assistant role and simulated response delay |

The layout targets laptop and desktop screens. The sidebar has a fixed width and the main
column shrinks (`min-w-0`), so pages do not scroll horizontally down to about 900 px wide.
Full mobile layouts are out of scope.

## Settings

One shared record (`AppSettings`, id 1), edited on `/settings` and stored in PostgreSQL:

- **Default assistant role** — the role new discovery sessions start with (New Discovery
  preselects it; the user can still pick another role before or during the chat). Each session
  stores its own role, so changing the default never changes existing sessions.
- **Simulated response delay** — how long "DORA is typing…" is shown before each reply,
  0–5000 ms (default 1500 ms). It is read on every turn, so a change applies from the next
  reply. The upper bound keeps every turn far below the 30 s processing-lock timeout; the API
  (Zod) and the database (`CHECK`) both enforce the range.

There are deliberately no model, temperature, top-p, API-key or prompt settings — DORA is
rule-based. Changes are saved only with Save Changes; leaving the page with unsaved changes asks
for confirmation.

## Accessibility

Checked with axe-core on every page (also with dialogs and menus open) and by keyboard:

- One `h1` per page (also on not-found and error pages), page titles per route.
- "Skip to main content" link as the first focus stop; visible focus rings throughout.
- Scrollable regions (progress panel, missing-field list) are keyboard-focusable.
- Text contrast ≥ 4.5:1, including the warning and destructive tokens on their tinted
  backgrounds (amber-800, red-700).
- Dialogs and menus (Radix) trap focus and close with Escape; Enter sends a message,
  Shift+Enter adds a line.

## Theme

Light theme only. All colours are semantic CSS variables in
[`src/app/globals.css`](src/app/globals.css), consumed through Tailwind utilities
(`bg-primary`, `text-muted-foreground`, …):

- Surfaces: white and very light slate; text: dark slate
- Primary accent: Telekom-inspired magenta `#E20074` (4.68:1 contrast with white text)
- Status tokens: `success`, `warning` (amber-800), `destructive` (red-700) — dark enough for
  4.5:1 text contrast on their own tinted backgrounds

Add shadcn/ui components with:

```bash
npx shadcn add <component>
```

## Known limitations

- Educational prototype: no authentication, single shared settings record, no multi-user
  collaboration (out of scope by specification).
- DORA uses keyword rules and templates; it can record off-topic text for free-text fields and
  does not understand language. Corrections need an explicit cue and field name.
- Regeneration fills only empty BRD fields; a requirement corrected in the chat after the BRD was
  generated does not update existing BRD text (clear the field, then regenerate).
- The unsaved-changes warning covers in-app links and reload/close, not browser back/forward.
- PDF text uses the Geist font; characters it lacks (e.g. emoji) appear as empty boxes. PDFs are
  not tagged for screen readers.
- No pagination for session and BRD lists; no live refresh across browser tabs.
- Browser end-to-end checks are not automated in the repository.
- Not yet deployed to Railway; the Docker image is verified locally only.
