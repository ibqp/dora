# DORA — Development Rules

Educational MVP: rule-based requirements discovery assistant + BRD generation.
`MASTER_SPEC.md` is the source of truth; `IMPLEMENTATION_STATUS.md` records what is built and verified.

@AGENTS.md

## Working agreement
- Implement only the phase requested; stop afterwards and wait for the next instruction.
- Never mark something done that was not verified. State how it was verified (automated test, manual run, static inspection) or that it was not.
- Update `IMPLEMENTATION_STATUS.md` (and the README where user-facing) at the end of every phase.
- Do not delete or reset database data you did not create. Use a dedicated database for destructive experiments.
- Never integrate an LLM or external AI service. Every DORA reply comes from `src/lib/mock-ai` rules and templates; replies say "recorded", never claim understanding.
- No fake persistence or placeholder controls presented as working. Unfinished features are absent or explicitly labeled.
- Never invent requirement values. Missing information is `null` and displayed as "Not specified".

## Architecture boundaries
- `src/lib/**` — pure, framework-free domain logic (no DB, no React, no clock/randomness in `mock-ai`). Shared with UI for display.
  - `mock-ai/` engine: `processTurn({ message, state, role })` → `{ state, reply, completenessPercentage, suggestBrd, events }`. Must stay deterministic.
  - `requirements/` field catalog (7 sections, 18 fields), Zod JSON schemas, the only completeness calculation.
  - `brd/` BRD rules (content from PROVIDED fields only, status, sections; `editing.ts`: a save that changes a field marks it in `manualEdits`, regeneration fills only empty fields and never touches fields with content).
  - `api/` request schemas, response types, browser client.
- `src/server/**` — persistence and HTTP helpers (server-only). Multi-record writes in one transaction.
  - `pdf/` BRD PDF via PDFKit (in `serverExternalPackages`), drawn from the saved BRD only — never from the UI or screenshots. Fonts are vendored in `assets/fonts/geist/` and read relative to `process.cwd()` (start the server in the project root). Tests extract PDF text with `tests/pdf-text.ts` (pdf.js).
- `src/app/api/**` — thin route handlers: validate (Zod) → call service → serialize. Wrap with `withErrorHandling`; errors are `{ error: { code, message, issues? } }`.
- `src/components/**`, `src/hooks/**` — UI only; no business rules in React components. Client components never import `@/server/*` or the Prisma client.

## Data rules
- Prisma 7: client generated to `src/generated/prisma` (git-ignored); use `getPrisma()` / `DbClient`. Import enums from `@/generated/prisma/enums` in shared code.
- Validate every JSON column (`RequirementState.fields`, BRD `content`, `manualEdits`) with the schemas in `src/lib/requirements/schemas.ts`; invalid stored data is a `DataIntegrityError` (500), never a client error.
- Schema changes only via new migrations in `prisma/migrations` (`migrate dev` is interactive; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` works non-interactively — strip the CLI banner line). Never edit applied migrations.
- One `AppSettings` row (id 1), one `RequirementState` and at most one BRD per session, cascade on session delete. No demo data. Settings bounds live in `src/lib/settings/settings.ts` (delay 0–5000 ms, mirrored by a DB `CHECK`); tests that change settings restore the row.
- Inside interactive transactions, don't read a `select` with several relations: Prisma 7 runs those relation queries concurrently on the transaction connection (pg deprecation, breaks in pg@9). Write in the transaction, read the detail after commit.
- BRD read-modify-writes (save, regenerate) lock the row first (`lockBrd`, `SELECT … FOR UPDATE`) inside the transaction. Status and completeness are always derived from the saved content.
- Message order is `Message.sequence`. User submissions carry a client UUID `clientRequestId` (unique) for idempotent retries.
- Discovery turns: acquire the session processing lock, run the engine, wait the simulated delay with no transaction open, then persist message pair + requirement state + stage in one transaction.

## Next.js 16 specifics (Cache Components on)
- Read the bundled docs in `node_modules/next/dist/docs/` before using unfamiliar APIs.
- GET route handlers that hit the DB call `await connection()` first. `withErrorHandling` calls `unstable_rethrow`.
- Dynamic `params` and `usePathname()` must sit inside `<Suspense>` (see `discovery/[sessionId]/page.tsx`, `app-sidebar.tsx`).
- Visited pages are kept alive in hidden `<Activity>`: state persists across navigation. Reset deliberately (e.g. `key={router.bfcacheId}`) where a fresh view is required; never assume unmount.
- `error.tsx` receives `retry` (not `reset`).

## Commands
- `npm run check` (typecheck + lint), `npm test` (unit), `npm run test:db` (needs `TEST_DATABASE_URL`, distinct from `DATABASE_URL`), `npm run build`, `npm run db:validate`.
- DB tests call route handlers directly; mock `next/server` `connection` and `@/server/discovery/delay` as the existing `*.db.test.ts` files do. Tests delete only records they created.
- Docker: `docker build -t dora .`, `docker compose up --build` (local app + PostgreSQL 17; set `DORA_PORT`/`DORA_DB_PORT` to avoid clashes). The image uses Next.js standalone output only when `NEXT_OUTPUT=standalone` (set in the Dockerfile); local `next start` stays regular. The container runs `prisma migrate deploy` before `node server.js` (`docker/entrypoint.sh`) — never migrate during the image build, never `db push`, reset or seed. Files read from disk at runtime (not imported) must be listed in `outputFileTracingIncludes` or the standalone image lacks them. `GET /api/health` is the health check.
- Never deploy, push images/commits, or touch Railway/production resources; deployment is the owner's manual step (`RAILWAY_DEPLOYMENT.md`).
- Stop servers by the PID listening on the port (`kill $(lsof -tiTCP:<port> -sTCP:LISTEN)`); `pkill -f "next start"` leaves `next-server` running.
- The repository lives in iCloud. Build output goes to `.next.nosync/` (`distDir`), which iCloud skips — keep generated/high-churn output in `*.nosync` paths. Files named `* 2.*` are iCloud conflict copies (they recur in `src/generated/prisma/`): never commit or edit them; remove with `find . -path ./node_modules -prune -o -name '* 2*' -type f -print -delete`.

## Style
- TypeScript strict (`noUncheckedIndexedAccess`), match surrounding code and comment density, `@/` imports.
- UI: light theme only, semantic tokens from `globals.css` (magenta primary), shadcn/ui primitives, desktop-first without horizontal overflow (check 1024 px).
- Accessibility (axe-checked in Phase 11): one `h1` per page (`EmptyState headingLevel="h1"` when it replaces the page), scrollable regions focusable (`tabIndex={0}` + focus ring) and `relative` (so `sr-only` labels stay inside and don't stretch the page), text ≥ 4.5:1 — don't lighten the `warning`/`destructive` tokens or use `text-muted-foreground` on tinted backgrounds.
- English for all UI text and DORA replies.
