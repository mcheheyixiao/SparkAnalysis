# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Spark AI Analyzer — a Minecraft server performance report analysis platform. Users paste `https://spark.lucko.me/{code}` links; the backend fetches spark performance data, runs rule-based pre-analysis, calls DeepSeek API for AI diagnosis, and returns a structured Chinese diagnostic report via a Vue 3 frontend.

**Stack:** Node.js 20 / TypeScript 5.8 strict / Fastify 5 / Prisma 6 (MySQL 8) / Vue 3 + Vite 6 + Naive UI / Vitest

## Commands

### Backend (`package.json` at repo root)

```bash
npm run dev            # Start dev server with hot-reload (tsx watch src/server.ts)
npm run build          # TypeScript compilation (tsc)
npm run typecheck      # Type-check only, no emit (tsc --noEmit)
npm run start          # Production start (node dist/server.js)
npm test               # Run all tests (vitest run)
npm run test:watch     # Watch mode tests (vitest)

# Prisma
npm run prisma:generate   # Regenerate Prisma Client
npm run prisma:migrate    # Create migration in dev (prisma migrate dev)
npm run prisma:deploy     # Apply migrations in production (prisma migrate deploy)
npm run prisma:seed       # Seed default admin, settings, prompt templates
```

### Frontend (`frontend/`)

```bash
cd frontend
npm run dev            # Vite dev server on port 3099 (proxies /api to :3001)
npm run build          # Type-check + vite build → frontend/dist/
npm run typecheck      # vue-tsc --noEmit
npm run preview        # Preview production build
```

### Running a single test

```bash
npx vitest run tests/<test-file>.test.ts           # Single file
npx vitest run -t "test name pattern"              # Match by name
```

## Architecture

### Request flow

```
User submits spark URL
  → POST /api/public/analyze (Zod validation + rate limit + SSRF-safe URL parse)
  → ReportService.findOrCreateReport (reuse check by sparkCode)
  → InMemoryJobQueue.enqueue → immediate 201 { reportId, status: "pending" }

Background pipeline (analysis-pipeline.ts):
  fetching_spark (15%)    → SparkFetcher: ?raw=1 then ?raw=1&full=true (sampler types)
  normalizing (30%)       → SparkNormalizer: extract TPS/MSPT/threads/sources/GC/entities
  rule_analyzing (45%)    → SparkRuleAnalyzer: source confidence grading, evidence classification
  building_prompt (60%)   → PromptBuilder: DB templates + variable substitution
  calling_ai (80%)        → DeepSeekProvider → zod validation → normalize → markdown generation
  saving_result (95%)     → Save AnalysisResult → status=completed

Frontend polls GET /api/public/reports/:id/status until completed, then GETs full report.
```

### Key architectural decisions

- **SSRF protection is multi-layered:** `SparkUrlParser` validates URL shape before any fetch, then `safeFetch` re-validates with strict rules (HTTPS only, `spark.lucko.me` hostname, no port/user/password, path must be `/{code}`, only `raw=1` and `full=true` query params). Redirects are followed manually (max 1 hop) with the same validation.
- **AI output is never trusted raw:** AI JSON goes through `attemptJsonRepair` → Zod `aiOutputSchema` validation → `normalizeToCanonical` → `buildMarkdownReportFromAiResult`. The AI's `markdown_report` field is always discarded; the backend generates the final markdown from structured fields. If all parsing fails, `buildFallbackResult` generates a clean markdown from rule analysis — raw AI output is never exposed to users.
- **Source confidence grading:** The rule analyzer distinguishes "source clues" (only in metadata.sources list, low confidence, NOT a root cause) from "suspected causes" (in main thread stack with >=5% self-time, medium/high confidence). This prevents false attribution.
- **InMemoryJobQueue** with `maxConcurrency` (default 2), `sparkCodeLocks` (prevent duplicate analysis of same spark code), and graceful shutdown (wait up to 30s for in-flight jobs, mark remaining as SERVER_SHUTDOWN).
- **JWT auth** uses a Fastify plugin (`plugins/auth.ts`) that decorates `fastify.authenticate` — admin routes call `preHandler: [fastify.authenticate]`.
- **Settings are key-value** in `SystemSetting` table, read via `settingsService.getBoolean/getNumber/getString` with defaults. 13 system settings control everything from rate limits to AI timeouts.
- **API Key encryption:** AES-256-GCM via `utils/crypto.ts`, key is a 32-byte base64 string from `ENCRYPTION_KEY` env var. Frontend only sees masked keys.

### Module organization

| Module | Path | Role |
|--------|------|------|
| `spark/` | `src/modules/spark/` | URL parsing, data fetching (safeFetch), normalization, rule analysis |
| `ai/` | `src/modules/ai/` | Provider interface, DeepSeek implementation, prompt building, analysis orchestration + JSON repair + fallback |
| `reports/` | `src/modules/reports/` | Report CRUD, markdown report builder |
| `queue/` | `src/modules/queue/` | `IJobQueueService` interface, `InMemoryJobQueueService`, `AnalysisPipeline` |
| `public/` | `src/modules/public/` | Public API routes + rate limiting |
| `admin/` | `src/modules/admin/` | All admin routes (reports/settings/prompts/queue/logs/auth) |
| `settings/` | `src/modules/settings/` | System settings key-value service |
| `prompts/` | `src/modules/prompts/` | Prompt template CRUD |
| `logs/` | `src/modules/logs/` | System log writer |

### Database (Prisma, 8 models)

`SparkReport` → `AnalysisResult` (1:1, cascade delete). `SystemSetting` and `PromptTemplate` are admin-managed. `AdminAuditLog` tracks all admin actions. `SystemLog` stores sanitized runtime logs. `AiSetting` holds encrypted API key and model config. `AdminUser` with bcrypt password hashes.

### Frontend structure

Vue 3 SPA with two layouts: `PublicLayout` (home + analyze + report pages) and `AdminLayout` (dashboard, reports, settings, prompts, logs, login). State management via Pinia stores (`auth.store.ts`, `report.store.ts`). API layer in `api/` with Axios instance. GSAP for reveal animations (`useRevealAnimation` composable). Naive UI component library.

### Spark data sources

- `?raw=1` — metadata JSON (TPS, MSPT, sources, platform info). Always fetched.
- `?raw=1&full=true` — full profiler data (thread call trees, class/method source maps). Fetched only for sampler/unknown types; failure is non-fatal (continues with metadata only).
- `sparkUserContentMaxBytes` and `sparkFullMaxBytes` system settings control size limits (defaults: 5MB / 30MB).

## Key patterns

### Error handling

All errors use `AppError(code, message)` from `utils/errors.ts`. The error handler plugin maps `ErrorCode` → HTTP status. Pipeline errors are classified by message heuristics (timeout → `SPARK_FETCH_TIMEOUT`, 404 → `SPARK_REPORT_NOT_FOUND`, etc.). Unknown errors become `INTERNAL_ERROR`.

### Adding a new AI provider

1. Implement `IAiProvider` interface (`ai-provider.interface.ts`)
2. Register in the provider map in `ai-analysis.service.ts`
3. Update `AiSetting.provider` field in admin UI

### Adding new spark data extraction paths

Extend `SparkNormalizer.extractServerInfo` / `extractHealth` / `extractProfiler` methods in `spark-normalizer.service.ts`. The normalizer already handles deep path traversal with fallbacks (e.g., trying `metadata.platformStatistics.uptime` then `metadata.metadata.platformStatistics.uptime`).

### Replacing the queue with BullMQ

Implement `IJobQueueService` interface, swap `new InMemoryJobQueueService()` for the new implementation in `server.ts`. No other code changes needed.

## Environment variables

See `.env.example`. Critical: `ENCRYPTION_KEY` must be 32 random bytes encoded as canonical base64 (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). `DATABASE_URL` must start with `mysql://`. `JWT_SECRET` minimum 32 chars.
