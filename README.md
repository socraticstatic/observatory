# Observatory

> **The AI observability tool designed for the person paying the bill, not just the person writing the code.**

Most observability tools ask "what happened?" — they're trace logs dressed up as dashboards. Observatory asks **"was this worth it?"** That's a different question with a different answer.

Every LLM call flows through a LiteLLM proxy that fires a webhook here. Observatory stores the event, runs a findings engine, and surfaces cost, latency, token efficiency, session structure, budget status, and anomaly findings in real time.

Built for one developer. No auth by default. Runs entirely on localhost.

---

## Features

### Pulse
Live cost and health dashboard.

- **Overall Cost Hero** - rolling spend vs. monthly budget, projected runway
- **Stat Strip** - calls, tokens, avg latency, error rate for the active lookback window
- **Services Rail** - per-provider spend, token counts, and 30-day sparklines
- **Burn Rate Rail** - daily burn by provider with projected monthly overage
- **Project Cost Rail** - spend by project tag
- **Findings Strip** - deterministic alert findings from the intelligence engine
- **Pulse Summary Verdict** - natural-language health status for the window

### Traces
Paginated LLM call log.

- Server-side cursor pagination (no full table scans)
- Filter by model, provider, project, surface, and status
- Expandable row detail: all token fields, cost, latency, session ID, quality score
- Adjustable lookback window: 1H / 24H / 30D / 90D / 1Y

### Costs (Cost Drivers)
Six-way cost attribution.

- By model, provider, project, surface, content type, and billing unit
- Absolute and percentage breakdowns

### Intel (Insights)
Intelligence layer for usage patterns and quality analysis.

- **Why Insights** - automated findings: zombie sessions, cache decay, error spikes
- **Quality/Cost Scatter** - model quality score vs. cost per call
- **Zombie Sessions** - sessions with activity gaps > 30 minutes
- **Context Composition** - input token breakdown by component
- **Counterfactual Simulator** - estimated savings from model switching or caching changes

### Sessions
Gantt timeline of multi-turn sessions.

- Horizontal bars scaled to wall-clock time
- Expandable rows: per-event latency, tokens, model, cost, status
- **Inline session labeling** - double-click any session to assign a persistent label
- Labels stored in `session_labels` table

### Five-W Analysis

| View | Shows |
|------|-------|
| **What** | Token lifecycle: input, output, cached, cache-creation, reasoning tokens per model |
| **Who** | Provider breakdown + model attribution by cost and call volume |
| **Where** | Regional distribution with SVG world map |
| **When** | Activity heatmap (day-of-week x hour-of-day) |
| **How** | Agent trace depth + event timeline waterfall |

### Rules
Automated monitoring configuration.

- **Alert Rules** - threshold rules (metric / operator / threshold / lookback). Evaluated by the findings engine and surfaced in the Findings Strip.
- **Budget System** - project- or provider-scoped spending limits with configurable period (1H / 24H / 30D / 90D / 1Y) and alert threshold percentage. Real-time spend vs. limit with animated progress bars. Status states: `ok`, `alert`, `exceeded`.

### Archive
Hot/warm/cold data tiering.

- Archive runs aggregate `llm_events` older than a configurable cutoff into `llm_daily_rollups`
- Optional deletion of raw events after rollup
- Export path for cold-tier JSON dumps
- Run history with row counts, timing, and status

### Security Terminal
Real-time SSE stream of system events, ingest activity, and alert firings.

### Entity Explorer
Deep drill-down on a session ID or project - full event list with raw payload inspection.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.2.4 (App Router) |
| UI | React 19.2.4, Tailwind CSS v4 |
| Font | Space Grotesk via `next/font/google` |
| API | tRPC v11.16 + TanStack Query v5 |
| ORM | Prisma 7.7.0 + `@prisma/adapter-pg` |
| Database | PostgreSQL 16 |
| Maps | react-simple-maps 3.0 |
| LLM Proxy | LiteLLM (separate process, port 4000) |
| Serialization | superjson (BigInt, Date support) |
| Testing | Vitest 4.1.4 |
| Language | TypeScript 5 strict |
| Package manager | npm |

---

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL + pgAdmin)
- Python 3.12+ with `pip install litellm`

---

## Setup

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

Starts:
- **PostgreSQL 16** on `localhost:5434`
- **pgAdmin 4** on `localhost:5050` (admin@observatory.local / observatory)

### 2. Environment variables

Create `.env.local` in the project root:

```env
# Database (matches docker-compose defaults)
DATABASE_URL="postgresql://observatory:observatory@localhost:5434/observatory"

# LiteLLM proxy
LITELLM_API_BASE="http://localhost:4000"
LITELLM_MASTER_KEY="your-master-key"
LITELLM_CALLBACK_SECRET="your-webhook-secret"

# Monthly budget display (USD)
MONTHLY_BUDGET_USD=100

# Provider API keys (read by LiteLLM at startup, not by the app)
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="AI..."
XAI_API_KEY="xai-..."

# Creative services (optional)
ELEVENLABS_API_KEY=
HEYGEN_API_KEY=
LEONARDO_API_KEY=
```

### 3. Apply schema

```bash
npx prisma db push
```

Or if migrating from a clean environment:

```bash
npx prisma migrate dev
```

### 4. Seed synthetic data (optional)

Generates 30 days of synthetic events across all providers:

```bash
npm run db:seed
```

### 5. Start the dev server

```bash
npm run dev
```

Dashboard: **http://localhost:3099**

### 6. Start LiteLLM

In a separate terminal:

```bash
litellm --config litellm/config.yaml --port 4000
```

The proxy routes LLM calls to providers and fires a success callback to `http://localhost:3099/api/ingest` after each completion.

---

## LiteLLM Configuration

Config lives at `litellm/config.yaml`. Default models:

| Model Name | Provider | Notes |
|------------|----------|-------|
| `claude-opus-4-7` | Anthropic | Requires `ANTHROPIC_API_KEY` |
| `claude-sonnet-4-6` | Anthropic | Requires `ANTHROPIC_API_KEY` |
| `claude-haiku-4-5-20251001` | Anthropic | Requires `ANTHROPIC_API_KEY` |
| `gemini-2.5-pro` | Google | Requires `GEMINI_API_KEY` |
| `gemini-2.5-flash` | Google | Requires `GEMINI_API_KEY` |
| `grok-3` | xAI | Requires `XAI_API_KEY` |
| `llama-3.1-70b` | Ollama (local) | Requires Ollama on :11434 |

The callback plugin at `litellm/observatory_callback.py` forwards completions to the ingest endpoint. Set `LITELLM_CALLBACK_SECRET` in both `.env.local` and the environment where LiteLLM runs.

---

## Ingest API

### `POST /api/ingest`

Receives LLM completion events. Called automatically by the LiteLLM callback.

**Auth** (optional): `x-litellm-signature: <secret>` or `Authorization: Bearer <secret>`. Validated against `LITELLM_CALLBACK_SECRET`. Skipped if env var is unset.

**Standard LiteLLM envelope:**

```json
{
  "model": "claude-sonnet-4-6",
  "custom_llm_provider": "anthropic",
  "usage": {
    "input_tokens": 1024,
    "output_tokens": 256,
    "cache_read_input_tokens": 512,
    "cache_creation_input_tokens": 256
  },
  "response_cost": 0.00314,
  "response_time": 1.23,
  "metadata": {
    "session_id": "sess-abc",
    "project": "my-app",
    "surface": "chat"
  }
}
```

**Creative service envelope** (ElevenLabs, HeyGen, Leonardo, Stability):

```json
{
  "provider": "elevenlabs",
  "service_type": "tts",
  "model": "eleven_flash_v2",
  "units_used": 450,
  "cost_usd": 0.00045,
  "latency_ms": 320,
  "status": "ok",
  "metadata": {
    "session_id": "sess-xyz",
    "project": "podcast"
  }
}
```

**Response:**

```json
{ "ok": true }
// or, on dedup hash collision:
{ "ok": true, "duplicate": true }
```

The ingest parser normalizes token fields per provider (Anthropic, Google, xAI, OpenAI-compatible). Cost comes from LiteLLM's `response_cost` field, falling back to the internal rate table at `src/lib/pricing.ts`. Events are deduplicated by SHA-256 hash of `model:second:inputTokens:outputTokens:cachedTokens:cacheCreationTokens`.

---

## Data Model

Eight Prisma models (`prisma/schema.prisma`):

| Model | Table | Purpose |
|-------|-------|---------|
| `LlmEvent` | `llm_events` | Raw completion: tokens, cost, latency, provider, model, session, project |
| `RegisteredService` | `registered_services` | Provider config: label, category, billing plan, monthly budget |
| `Annotation` | `annotations` | Timeline annotations (manual or automated) |
| `ArchiveRun` | `archive_runs` | Archive job history with row counts and status |
| `LlmDailyRollup` | `llm_daily_rollups` | Aggregated daily stats per provider/model/project |
| `SessionLabel` | `session_labels` | User-assigned label for a session ID |
| `AlertRule` | `alert_rules` | Threshold-based alert rule definitions |
| `Budget` | `budgets` | Project/provider spending limits with period and alert percentage |

---

## tRPC Routers

20 routers registered in `src/server/routers/_app.ts`:

| Router | Key Procedures | Description |
|--------|---------------|-------------|
| `pulse` | `chart`, `statStrip`, `costSummary` | Pulse dashboard data |
| `health` | `check` | DB connectivity |
| `what` | `tokenLifecycle` | Token breakdown by model |
| `who` | `providerBreakdown`, `modelAttribution` | Provider and model cost shares |
| `where` | `regional` | Geographic distribution |
| `when` | `heatmap` | Activity heatmap |
| `how` | `agentTrace`, `timeline` | Agent depth + event timeline |
| `content` | `contentTypes` | Content type distribution |
| `surface` | `appSurface` | Surface (chat/API/batch) breakdown |
| `events` | `list` | Event timeline data |
| `entity` | `projects`, `sessions`, `turns` | Entity-level drill-down |
| `insights` | `findings` | Deterministic findings engine |
| `traces` | `list` | Cursor-paginated call log |
| `sessions` | `list`, `events` | Session Gantt data |
| `costDrivers` | `breakdown` | 6-way cost attribution |
| `services` | `list`, `upsert`, `remove`, `sync` | Registered service CRUD |
| `archive` | `list`, `run` | Archive management |
| `sessionLabels` | `list`, `upsert`, `remove` | Session label CRUD |
| `alertRules` | `list`, `upsert`, `remove` | Alert rule CRUD |
| `budgets` | `list`, `upsert`, `remove`, `status` | Budget CRUD + real-time spend status |

---

## Findings Engine

`insights.findings` runs a deterministic rule engine against recent events. Findings shape:

```ts
{
  id: string;
  category: string;
  severity: 'act' | 'warn' | 'info';
  title: string;
  detail: string;
  action: string;
}
```

Active rules:

| ID | Severity | Trigger |
|----|----------|---------|
| `zombie-sessions` | warn | Sessions with activity gaps > 30 min |
| `error-spike` | act | Error rate > 5% in last 24H |
| `cache-decay` | warn | Cache hit rate dropped > 20% vs. 7-day baseline |
| `cache-underutilized` | info | Overall cache hit rate < 15% across window and 7-day average |
| `budget-exceeded` | act | Spend >= 100% of any enabled budget limit |
| `budget-alert` | warn | Spend >= alertPct% of any enabled budget limit |

---

## Navigation

```
PRIMARY
  Pulse       - live cost and health dashboard
  Traces      - LLM call log with cursor pagination
  Costs       - six-way cost attribution
  Intel       - insights, quality analysis, zombie detection
  Sessions    - Gantt session timeline + labels

FIVE-W
  What        - token lifecycle by model
  Who         - provider and model breakdown
  Where       - regional distribution map
  When        - activity heatmap
  How         - agent trace waterfall + event timeline

SECONDARY
  Rules       - alert rules + budget system
  Archive     - hot/warm/cold data tiering
```

---

## Development

```bash
npm run dev          # Dev server on :3099
npx tsc --noEmit     # Type check
npm run lint         # ESLint
npm test             # Vitest (all routers)
npm run test:watch   # Vitest watch mode
npm run db:studio    # Prisma Studio (browser DB explorer)
npm run db:seed      # Seed 30 days of synthetic events
```

---

## Testing

Vitest unit tests for all tRPC routers. Each test file mocks Prisma via a `mockDb` object injected as `ctx.db`, testing router logic without touching the database.

```bash
npm test
```

Test coverage:
- `pulse.test.ts`, `pulse-ingest.test.ts`
- `who.test.ts`, `what.test.ts`, `when.test.ts`, `where.test.ts`
- `surface.test.ts`, `content.test.ts`, `entity.test.ts`
- `sessions.test.ts`, `traces.test.ts`
- `insights.test.ts`, `rules.test.ts`
- `budgets.test.ts`

---

## Architecture Notes

**No SSR data fetching.** All data goes through tRPC procedures via TanStack Query. The App Router page component bridges global state (active view, lookback, provider filter) to view components as props.

**Global provider filter.** `CommandHeader` exposes a provider selector that filters all views simultaneously.

**Deduplication.** The ingest route hashes `model:second:inputTokens:outputTokens:cachedTokens:cacheCreationTokens` via SHA-256. Prisma catches unique constraint violations (P2002) and returns `{ ok: true, duplicate: true }` silently — handles LiteLLM multi-worker double-fire.

**Cost calculation order.** The ingest parser prefers `response_cost` / `cost` from the LiteLLM envelope. Falls back to `src/lib/pricing.ts` only if the field is absent.

**Archive tiering.** Raw `llm_events` older than `cutoffDays` are rolled up into `llm_daily_rollups` (calls, cost, tokens, errors, avg latency per day/provider/model/project) and optionally deleted.

**Worktrees.** Feature branches use git worktrees under `.claude/worktrees/`. Each worktree needs its own `.env.local` (git-ignored — copy from the main repo).

---

## The single-session test

At any point, Observatory should be able to answer this in one session for a stranger:

> *"I ran X AI calls this week. Here's what they cost, here's what was wasteful, here's what needs attention."*

If the answer requires more than one screen, a legend, or an explanation — the product isn't done yet.
