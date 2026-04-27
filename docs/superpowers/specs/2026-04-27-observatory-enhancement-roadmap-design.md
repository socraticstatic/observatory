# Observatory Enhancement Roadmap — Design Spec
**Date:** 2026-04-27
**Status:** Approved for implementation

---

## Context

Observatory is a self-hosted personal LLM observability dashboard. This spec covers three phases of competitive enhancement derived from a ruthless assessment against Langfuse, LangSmith, Helicone, Braintrust, Arize Phoenix, W&B Weave, Portkey, and OpenLLMetry.

Observatory's current strengths (anomaly findings engine, session Gantt, multi-provider coverage, budget/rules system) are preserved. These phases close the gaps.

---

## Phase 1 — Operational Completeness

**Goal:** Bring the observability and alerting data to competitive parity with Helicone and Portkey. Pure data model + tRPC changes. No new views.

### 1.1 Latency Percentiles

**Problem:** Average latency is a lie. Averages hide tail latency outliers — which is exactly where production problems live.

**Design:**
- Add `p50Ms Float?`, `p95Ms Float?`, `p99Ms Float?` to the `LlmDailyRollup` Prisma model.
- Add a `computePercentiles(values: number[], ps: number[]): number[]` utility to `src/lib/fmt.ts` or a new `src/lib/stats.ts`.
- Update the archive/rollup job (`src/lib/providers/daily-rollup.ts`) to compute and store percentiles from raw event latency values during rollup.
- Update `pulse.statStrip` tRPC procedure to return p50/p95/p99 for the active window: for windows within the retention period, compute inline from `llm_events` using `percentile_disc` PostgreSQL aggregate or by fetching all `latencyMs` values and computing in-process; for archived windows, read from `llm_daily_rollup` p50/p95/p99 columns. The inline path uses `percentile_disc(0.5) WITHIN GROUP (ORDER BY "latencyMs")` in a raw SQL query.
- Render three new stat cells on `StatStrip`: `p50`, `p95`, `p99` alongside the existing avg latency.
- Add a `percentileBreakdown` sub-query to `costDrivers.breakdown` to surface latency percentiles per model and provider.

**Schema change:**
```prisma
model LlmDailyRollup {
  // ... existing fields ...
  p50Ms Float? @map("p50_ms")
  p95Ms Float? @map("p95_ms")
  p99Ms Float? @map("p99_ms")
}
```

**Tests:** Unit test `computePercentiles` with known arrays. Router test for `pulse.statStrip` returning percentile fields.

---

### 1.2 Projected Monthly Cost Extrapolation

**Problem:** Observatory shows current spend but not trajectory. A budget card says "$47 of $100" — not "you'll hit $112 by month end."

**Design:**
- Add a `projection` field to the `pulse.costSummary` tRPC response.
- Compute from: `avgDailyCost = totalSpendLast7Days / 7` × `daysRemainingInCalendarMonth` + `spentSoFarThisMonth`.
- Return `{ projectedMonthUsd: number, daysRemaining: number, trend: 'over' | 'under' | 'on-track' }` where `over` = projection exceeds any active budget by > 10%.
- Render on `OverallCostHero`: "Projected: $X.XX this month" badge below the spend bar, with red tint when `trend === 'over'`.
- No schema change required.

**Tests:** Router test for `pulse.costSummary` with known spend data returning correct projection.

---

### 1.3 Alert Delivery — Webhooks on Rule Fire

**Problem:** Alert rules and budget thresholds exist but fire silently into the UI. Nothing pages you.

**Design:**
- Add `webhookUrl String?` to `AlertRule` Prisma model.
- Add `webhookUrl String?` to `Budget` Prisma model (optional — for budget-exceeded notifications).
- When the `insights.findings` procedure emits a finding that matches an enabled `AlertRule` with a configured `webhookUrl`, fire a `POST` to the URL (non-blocking, best-effort — catch and log failures, don't throw).
- Webhook payload: `{ id, category, severity, title, detail, action, firedAt }`.
- Add a `webhookUrl` field to the AlertRule form in `RulesView`.
- Add a "Test webhook" button that sends a synthetic finding payload to the configured URL.
- No breaking changes to existing alert rules (field is nullable, existing rules work as-is).

**Schema changes:**
```prisma
model AlertRule {
  // ... existing fields ...
  webhookUrl String? @map("webhook_url")
}

model Budget {
  // ... existing fields ...
  webhookUrl String? @map("webhook_url")
}
```

**Tests:** Mock `fetch` in router tests. Verify webhook is called with correct payload when a finding fires with a matching rule.

---

### 1.4 User Dimension

**Problem:** Observatory has no per-user cost, latency, or error rate. Every competitor tracks this. LiteLLM already passes `user` in its envelope.

**Design:**
- Add `userId String?` to `LlmEvent` Prisma model.
- Update `parseIngestPayload` in `src/lib/ingest.ts` to extract `body.user ?? body.metadata?.user_id` and map to `userId`.
- Add `userId` to ingest parser test fixtures.
- Add a "Users" tab to `CostDriversView` alongside the existing provider/model/project tabs. Shows: userId, total cost, call count, avg latency, error rate.
- Add `users` as a breakdown dimension in `costDrivers.breakdown` tRPC procedure using `GROUP BY "userId"`.
- Global provider filter should also accept a userId filter (optional, low priority).

**Schema change:**
```prisma
model LlmEvent {
  // ... existing fields ...
  userId String? @map("user_id") @db.VarChar(255)
  @@index([userId])
}
```

**Tests:** Ingest parser test: `userId` extracted from `body.user`. Router test: `costDrivers.breakdown` with `dimension: 'user'` groups by userId.

---

### 1.5 Cache Hit Rate Time Series

**Problem:** Observatory detects `cache-decay` and `cache-underutilized` findings but has no chart of cache hit rate over time. The raw data exists — `cachedTokens` and `cacheCreationTokens` are already on every event.

**Design:**
- Add `cacheHits Int @default(0)` and `cacheAttempts Int @default(0)` to `LlmDailyRollup`.
  - `cacheHits` = count of events where `cachedTokens > 0`
  - `cacheAttempts` = count of events where `inputTokens > 0` (i.e. all LLM calls)
  - `cacheHitRate = cacheHits / cacheAttempts * 100`
- Update `daily-rollup.ts` to compute and store these during rollup.
- Add a `cacheTimeSeries` procedure to `pulse` router: returns daily cache hit rate for the last 30 days (from rollup + live events).
- Add a small cache hit rate sparkline to `PulseBar` or as a new cell on `StatStrip`.
- The `cache-underutilized` finding in `insights.ts` should use `cacheTimeSeries` data to compute the 7-day baseline instead of re-querying raw events.

**Schema change:**
```prisma
model LlmDailyRollup {
  // ... existing fields ...
  cacheHits    Int @default(0) @map("cache_hits")
  cacheAttempts Int @default(0) @map("cache_attempts")
}
```

**Tests:** Unit test hit rate computation. Router test for `pulse.cacheTimeSeries` returning daily rates.

---

## Phase 2 — Trace Depth

**Goal:** Make Observatory a serious tracing tool, not just a cost dashboard with extras. Closes the LangSmith / Langfuse gap on trace visualization.

### 2.1 Nested Trace Tree

**Problem:** The Traces view is a flat paginated list. No depth. No parent-child relationships. A single agent request involving 5 LLM calls + 3 tool calls looks like 8 unrelated rows.

**Design:**
- Add `parentSpanId String?` and `spanId String?` to `LlmEvent`.
- Update `parseIngestPayload` to extract `body.id` → `spanId` and `body.parent_id` → `parentSpanId` from LiteLLM span payloads.
- Update `tracesRouter.list` to optionally return a tree structure: when `treeMode: true` is passed, return only root spans (where `parentSpanId IS NULL`) with nested `children` arrays populated recursively up to 5 levels deep.
- Build `TraceTreeRow` component: a collapsible row with left-indent per depth level, latency bar scaled to parent, token/cost summary. Reuse the expand/collapse logic from `SessionsView`.
- `TracesView` gets a toggle: `Flat | Tree`. Tree mode groups events by span tree. Flat mode is the current paginated list (unchanged).
- Clicking a root span in tree mode expands all children inline without navigation.

**Schema change:**
```prisma
model LlmEvent {
  // ... existing fields ...
  spanId       String? @map("span_id")
  parentSpanId String? @map("parent_span_id")
  @@index([parentSpanId])
}
```

**Tests:** Router test for `tracesRouter.list` with `treeMode: true` returning nested structure. Unit test for tree assembly logic (separate util function).

---

### 2.2 OTel Ingest Endpoint

**Problem:** Observatory requires LiteLLM proxy. Every tool using OpenLLMetry, Arize Phoenix, or manual OTel instrumentation can't send events here without a proxy in front.

**Design:**
- Add `POST /api/ingest/otel` — a new Next.js route handler.
- Accept OTel JSON export format (`ResourceSpans` array) with `gen_ai.*` semantic attributes per the OTel GenAI semantic conventions (1.0.0).
- Map OTel attributes to `NormalizedEvent`:
  - `gen_ai.system` → `provider`
  - `gen_ai.request.model` → `model`
  - `gen_ai.usage.input_tokens` → `inputTokens`
  - `gen_ai.usage.output_tokens` → `outputTokens`
  - `gen_ai.usage.cache_read_input_tokens` → `cachedTokens`
  - OTel span `spanId` → `LlmEvent.spanId` (unique to this span)
  - OTel span `parentSpanId` → `LlmEvent.parentSpanId`
  - OTel span `traceId` → `LlmEvent.sessionId` (the trace = session in Observatory's model)
  - `session.id` attribute → `sessionId` (overrides traceId if present)
  - `user.id` attribute → `userId`
- Reuse `db.llmEvent.create` — same pipeline as existing ingest.
- Add `X-OTel-Secret` header auth (same `LITELLM_CALLBACK_SECRET` env var, optional).
- Document the endpoint in README.

**Tests:** Unit tests for OTel payload parser with sample `ResourceSpans` fixture. Integration test for the route handler.

---

## Phase 3 — Quality Layer

**Goal:** Add the eval foundation. Closes the most significant conceptual gap vs. Braintrust and Langfuse. Adds quality data Observatory currently has none of.

### 3.1 Inline Trace Quality Scoring

**Problem:** Observatory surfaces cost and latency on every trace but nothing about output quality. The `Annotation` model exists but isn't surfaced in Traces.

**Design:**
- Add `score Int?` (1-5) to `Annotation` Prisma model if not present.
- Add an `annotation.rate` tRPC mutation: `{ traceId, score, note? }` → creates or updates `Annotation` for the event.
- Add a `annotation.get` query: returns annotation for a given `traceId`.
- In `TracesView` detail panel: add a 1-5 star rating widget (5 clickable stars) + optional text field. Persists on click via the mutation.
- In `CostDriversView` and `WhoCard`: add a "Avg Quality" column per model and provider. Computed from `AVG(a.score) JOIN annotations ON trace_id = event.id`.
- The star widget uses the existing cold-steel palette: unset = muted, rated = accent color.

**Schema change:** The existing `Annotation` model has no link back to a specific `LlmEvent`. Add `traceId` and `score`:
```prisma
model Annotation {
  // ... existing fields: id, ts, type, title, detail, impact, severity ...
  score   Int?    // 1-5 quality rating
  traceId String? @map("trace_id") // FK to LlmEvent.id (not enforced — events may be archived)
  @@index([traceId])
}
```
`traceId` is not a foreign key constraint because rated events may be archived/deleted. Referential integrity is soft.

**Tests:** Mutation test for `annotation.rate`. Query test for per-model avg quality in `costDrivers`.

---

### 3.2 Dataset Pinning

**Problem:** No way to turn a production trace into a test case. The observe → improve loop doesn't close.

**Design:**
- Add two new Prisma models:
  ```prisma
  model EvalDataset {
    id        String            @id @default(uuid())
    name      String
    createdAt DateTime          @default(now())
    items     EvalDatasetItem[]
    @@map("eval_datasets")
  }

  model EvalDatasetItem {
    id        String      @id @default(uuid())
    datasetId String      @map("dataset_id")
    eventId   String      @map("event_id")
    note      String?
    addedAt   DateTime    @default(now())
    dataset   EvalDataset @relation(fields: [datasetId], references: [id], onDelete: Cascade)
    @@map("eval_dataset_items")
  }
  ```
- Add `datasetsRouter`: `list`, `create`, `addItem`, `removeItem`, `items`.
- In `TracesView` detail panel: add a "Pin to dataset" button with a popover to select or create a dataset.
- Add a `/datasets` nav entry under SECONDARY_NAV (alongside Rules, Archive).
- `DatasetsView`: lists datasets with item counts. Clicking a dataset shows its pinned traces (read-only).
- No eval runner in this phase. Curation only.

**Tests:** Router tests for `datasetsRouter` CRUD operations.

---

### 3.3 Prompt Fingerprinting

**Problem:** No way to correlate performance changes with prompt changes. A prompt edit could improve or degrade quality/cost — you'd never know.

**Design:**
- Add `promptHash String?` to `LlmEvent` — SHA-256 (first 12 hex chars) of the system prompt content.
- Update `parseIngestPayload` to extract `body.messages?.[0]?.content` (system prompt), hash it, store truncated hash as `promptHash`.
- Add a "Prompts" breakdown to `CostDriversView`: groups by `promptHash`, shows cost, call count, avg latency, avg quality score per hash.
- Display hashes as `sha:abc123de...` with a copy button.
- No prompt editor. No prompt storage. Only fingerprinting + grouping.

**Schema change:**
```prisma
model LlmEvent {
  // ... existing fields ...
  promptHash String? @map("prompt_hash") @db.VarChar(16)
  @@index([promptHash])
}
```

**Tests:** Ingest parser test: hash extracted and truncated. Router test: `costDrivers.breakdown` with `dimension: 'prompt'` groups by promptHash.

---

## Implementation Sequence

```
Phase 1 (1 sprint — all low-effort, high-impact operational items):
  1.1 Latency percentiles
  1.2 Projected monthly cost
  1.3 Alert webhooks
  1.4 User dimension
  1.5 Cache hit rate time series

Phase 2 (1 sprint — trace depth):
  2.1 Nested trace tree
  2.2 OTel ingest endpoint

Phase 3 (1 sprint — quality layer):
  3.1 Inline quality scoring
  3.2 Dataset pinning
  3.3 Prompt fingerprinting
```

Each phase is independently shippable. Phase 1 has no dependencies. Phase 2.1 (trace tree) benefits from Phase 1 data but has no hard dependency. Phase 3.1 depends on the existing `Annotation` model. Phase 3.2 is standalone.

---

## What This Does NOT Include

- Auth / multi-tenant (out of scope — stays localhost)
- LLM-as-judge automated eval runner (Phase 3 datasets are the prerequisite; runner is next iteration)
- Prompt management UI with editing (fingerprinting only in Phase 3)
- Vector embedding clustering (requires embedding infrastructure)
- RAG evaluation metrics (not applicable to current provider set)

---

## Success Criteria

After all three phases:
- Observatory surfaces p50/p95/p99 latency on every aggregation view
- Alert rules deliver payloads to a webhook URL
- Per-user cost breakdown available in Costs view
- Cache hit rate visible as a time series on Pulse
- Trace tree mode shows parent-child span relationships
- Any OTel-instrumented app can send spans to `/api/ingest/otel`
- Any trace can be rated 1-5 and pinned to a dataset
- Prompt changes are fingerprinted and performance is attributable to prompt version
