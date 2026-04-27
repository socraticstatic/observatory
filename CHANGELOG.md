# Changelog

All notable changes to Observatory are documented here, organized by milestone.

---

## [PR #14] Iteration 3 — Budget System, Cache Findings, Dead-Code Cleanup
**2026-04-27**

### Added
- **Budget model** (`prisma/schema.prisma`) - `Budget` table with project, provider, limitUsd (Decimal), period (1H/24H/30D/90D/1Y), alertPct (int), enabled, createdAt
- **`budgetsRouter`** (`src/server/routers/budgets.ts`) - four procedures:
  - `list` - all budgets, normalized (limitUsd as number, createdAt as ISO string)
  - `upsert` - create or update by id, validates via Zod
  - `remove` - delete by id
  - `status` - real-time spend vs. limit per enabled budget using `$queryRaw` against `llm_events`; returns pct, spendUsd, and status (`ok` / `alert` / `exceeded`)
- **Budget UI** in `RulesView.tsx` - add-budget form (project, provider, limitUsd, period, alertPct), budget cards grid with animated progress bars and color-coded status states
- **Budget findings** in `insights.ts` - `budget-exceeded` (act) fires when spend >= 100% of limit; `budget-alert` (warn) fires when spend >= alertPct%
- **`cache-underutilized` finding** - info-severity finding fires when overall cache hit rate < 15% in both the current window and the 7-day baseline (distinct from `cache-decay` which tracks a drop from baseline)
- **10 new router tests** (`src/__tests__/routers/budgets.test.ts`) covering list (normalized types, empty), upsert (create path, update path, normalized return), remove (delete call), and status (ok / alert / exceeded / empty)
- **`budgets` registered** in `_app.ts`

### Removed
- Dead `src/server/routers/rules.ts` and `src/__tests__/routers/rules.test.ts` - orphaned router never registered in `_app.ts`; `alertRules.ts` is canonical

---

## [PR #12-#13] Intelligence Layer, Provider Sync, Pricing Engine, Audit Fixes
**2026-04-27**

### Added
- **InsightsView** (`src/components/views/InsightsView.tsx`) - full Intel section with Why Insights, Quality/Cost Scatter, Zombie Sessions, Context Composition, and Counterfactual Simulator
- **`health` router** (`src/server/routers/health.ts`) - DB connectivity check for the status bar
- **`alertRules` router** (`src/server/routers/alertRules.ts`) - CRUD for threshold-based alert rules (metric / lookback / operator / threshold / enabled)
- **`sessionLabels` router** (`src/server/routers/sessionLabels.ts`) - CRUD for persistent session labels
- **`pricing.ts`** (`src/lib/pricing.ts`) - internal rate table for cost fallback when LiteLLM `response_cost` is absent
- **`service-registry.ts`** (`src/lib/service-registry.ts`) - billing unit lookup per provider
- **`daily-rollup.ts`**, **`elevenlabs-sync.ts`**, **`heygen-sync.ts`**, **`leonardo-sync.ts`** - provider sync utilities
- **`/api/export`**, **`/api/recalculate`**, **`/api/sync`** - REST endpoints for data management
- **`/api/proxy/anthropic`**, **`/api/proxy/openai`** - transparent pass-through proxy routes
- **`FindingsStrip`** component - surfaces findings from insights engine in Pulse view
- **`ProjectCostRail`** component - project-level spend breakdown in Pulse
- **`PulseSummaryVerdict`** component - natural-language health status
- **`ViewStatusBar`** component - active view status indicator
- **Alert Rules UI** in `RulesView.tsx` - full CRUD form for managing threshold-based alert rules
- **Session label inline edit** in `SessionsView.tsx` - double-click session bar to assign a persistent label
- `pulse-ingest.test.ts` - dedicated ingest pipeline tests

### Changed
- `insights.ts` expanded with `cache-decay` finding (detects drop vs. 7-day baseline), zombie-session detection, error-spike rule, and WhyInsights data aggregation
- `sessions.ts` — session label join, improved gap detection
- `ingest.ts` — event hash deduplication, quality score parsing, Grok output token re-count fallback for known xAI zero-completion bug
- `ingest/route.ts` — P2002 duplicate handling returns `{ ok: true, duplicate: true }` instead of throwing

### Fixed
- Prisma schema migrations for billing_plan, billing_unit, event_hash dedup columns
- `AppSurfaceCard` LOOKBACK_MINUTES type alignment
- Various TypeScript strict-mode violations across router files

---

## [PR #10] Iteration 2 — Ingest Age, Provider Filter, Services Refresh, Hydration Fix, Rules Persistence
**2026-04-20**

### Added
- Ingest age tracking (time since last event) displayed in stat strip
- Provider filter state persisted across navigation
- Services refresh action in Services Rail
- Alert rules persistence to `alert_rules` table (previously in-memory only)

### Fixed
- React hydration mismatch on initial render (server/client state divergence)
- Services Rail filter case sensitivity bug

---

## [PR #9] Provider Filter, Add Service, Ticker Pause, Design Anti-Patterns
**2026-04-20**

### Fixed
- `ALL` filter bug in CommandHeader — was incorrectly filtering when "All" was selected
- Add Service modal alignment to Claude.ai design system
- Ticker pause on inactive tab

### Changed
- CommandHeader design tokens aligned to Claude.ai exact computed values
- Cold-steel palette applied across full color system from Claude Design prototype

---

## [PR #8] npm test Script
**2026-04-20**

Added `test` script to `package.json` for CI compatibility.

---

## [PR #6] Dead Code Cleanup
**2026-04-20**

Removed orphaned `cost-drivers.ts` router (superseded by `costDrivers.ts`).

---

## [PR #5] RulesView + ArchiveView
**2026-04-20**

### Added
- **RulesView** with configurable monthly budget display and alert rule stubs
- **ArchiveView** with archive run history, status, and trigger UI
- **`archive` tRPC router** — `list` and `run` procedures with `ArchiveRun` model persistence

---

## [PR #4] Lint and TypeScript Cleanup
**2026-04-20**

Resolved all ESLint errors and TypeScript type violations across the full codebase. Strict compliance baseline for subsequent development.

---

## [PR #2] Claude Palette Alignment, Real Token Data, Quality Pipeline
**2026-04-20**

### Added
- Quality score field in `LlmEvent` - parsed from `metadata.quality_score`
- `qualityScore` persisted to DB as `Decimal(4,2)`
- Quality/Cost Scatter data wired to real events

### Changed
- Full color system migrated to Claude warm palette
- All components updated to use Claude.ai design tokens (exact computed values)
- `WhatCard` surfaces `cacheCreationTokens` in token lifecycle chart

### Fixed
- Gemini ingestion - LiteLLM-normalized token fields correctly mapped
- Anthropic model IDs updated to current API versions
- LiteLLM callback metadata extraction from `litellm_params`

---

## [PR #1] Token Lifecycle, SessionsView Gantt, Full Test Suite
**2026-04-20**

### Added
- **Token lifecycle chart** in WhatCard — input, output, cached, cache-creation, reasoning tokens per model
- **SessionsView** — Gantt timeline with horizontal bars scaled to wall-clock time
  - Expandable rows: per-event tokens, cost, latency, model, status
  - Stable row keys, memoized window start, expand indicator
- **Full router test suite** (Vitest):
  - `who.test.ts` - providerBreakdown, modelAttribution
  - `what.test.ts`, `when.test.ts` - tokenLifecycle, heatmap
  - `surface.test.ts`, `content.test.ts` - appSurface, contentTypes
  - `where.test.ts`, `entity.test.ts` - regional, projects/sessions/turns
  - `how.test.ts` - agentTrace, timeline
  - `insights.test.ts` - whyInsights, zombieSessions
  - `sessions.test.ts` - list, events with bigint fixture handling
  - `traces.test.ts` - cursor pagination

### Fixed
- BigInt literal support — bumped TypeScript target to ES2020
- SessionsView: barStyle guard for out-of-window sessions

---

## [Initial Scaffold] Foundation
**2026-04-19**

### Added
- Next.js 16.2.4 app scaffold with TypeScript strict mode
- PostgreSQL 16 via Docker Compose (`localhost:5434`)
- Prisma 7 schema — `LlmEvent`, `RegisteredService`, `Annotation` models
- `@prisma/adapter-pg` for direct TCP connection (no PgBouncer required)
- tRPC v11 + TanStack Query v5 setup with superjson transformer
- LiteLLM proxy config (`litellm/config.yaml`) with Anthropic, Google, xAI, Ollama model routing
- LiteLLM callback plugin (`litellm/observatory_callback.py`)
- Ingest endpoint `POST /api/ingest` with LiteLLM envelope parser
- SSE stream endpoint for Security Terminal
- All 11 initial tRPC data routers: pulse, what, who, where, when, how, content, surface, events, entity, insights
- TracesView with cursor pagination and model/provider/status filters
- CostDriversView with 6-way breakdown (model, provider, project, surface, content type, billing unit)
- Pulse dashboard: OverallCostHero, StatStrip, ServicesRail, PulseBar, EventTimelineCard, BurnRateRail
- Five-W cards all wired to real tRPC data (replacing makeRng stubs)
- Global provider filter in CommandHeader
- Add Service modal + registered services management
- 30-day synthetic seed script (`prisma/seed.ts`)
- Lookback types and URL-param hook (`src/lib/lookback.ts`)
- Space Grotesk font via `next/font/google`
- Auth removed — personal localhost tool
