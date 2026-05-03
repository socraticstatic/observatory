# Observatory Design Spec

**Date:** 2026-05-03
**Repo:** socraticstatic/observatory
**Status:** Approved

## Goal

A standalone local service that receives AI usage events from vault-daemon (and future projects), stores them in SQLite, and serves a live web dashboard at `http://localhost:3099`. Real-time — the dashboard updates via SSE the moment any ingest event lands.

## Why a Separate Repo

vault-daemon is Helen's MCP server. Token observability is a cross-project concern — vault-daemon, pen-and-paper, and future callers all feed into one place. The observatory is infrastructure, not an integration.

## Architecture

```
vault-daemon (burn0 auto-intercepts Gemini)
     │
     └─► observatory-client.ts ──POST /api/ingest──► Observatory server (port 3099)
                                                          │
                                                      SQLite (events table)
                                                          │
                                              SSE push on every ingest event
                                                          │
                                             Web dashboard (Vite + React)
                                             http://localhost:3099
```

**burn0** stays in vault-daemon for automatic Gemini fetch interception. The observatory client handles explicit events: Leonardo image credits, custom tool metadata, future callers.

## Repo Structure

```
socraticstatic/observatory/
  server/
    src/
      index.ts          — Hono app: /api/ingest, /api/summary, /sse, static files
      db.ts             — SQLite schema + queries (better-sqlite3)
      sse.ts            — SSE broadcaster: notify all open clients on ingest
    package.json
    tsconfig.json
  dashboard/
    src/
      App.tsx           — root: Today | By Model | By Tool | By Project tabs
      views/
        Today.tsx       — today's cost, token counts by model, top 5 tools
        ByModel.tsx     — bar chart: cost per model, 7d / 30d toggle
        ByTool.tsx      — sortable table: tool, calls, tokens, cost, latency
        ByProject.tsx   — same as ByTool but grouped by project
      hooks/
        useSSE.ts       — connects to /sse, triggers refetch on push
    package.json
    vite.config.ts
  launchd/
    com.micahbos.observatory.plist
  README.md
```

## Data Model

**SQLite table: `events`**

```sql
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,           -- ISO 8601 timestamp
  project     TEXT NOT NULL,           -- "vault-daemon", "pen-and-paper", etc.
  tool        TEXT,                    -- "gemini_deep_research", "leonardo_generate"
  provider    TEXT NOT NULL,           -- "google", "leonardo", "anthropic"
  model       TEXT NOT NULL,           -- "gemini-2.0-flash", "flux-dev"
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cost_usd    REAL,
  latency_ms  INTEGER,
  status      TEXT NOT NULL DEFAULT 'ok'
);

CREATE INDEX idx_events_ts      ON events(ts);
CREATE INDEX idx_events_project ON events(project);
CREATE INDEX idx_events_provider ON events(provider);
CREATE INDEX idx_events_model   ON events(model);
```

No migrations for v1 — drop and recreate if schema changes.

## Ingest API

`POST /api/ingest`

Headers:
- `Content-Type: application/json`
- `x-litellm-signature: <LITELLM_CALLBACK_SECRET>` (same Keychain secret as the old observatory.ts)

Body: the event JSON matching the table columns above. All fields optional except `project`, `provider`, `model`, `status`, `ts`.

Response: `{"ok":true}` or `{"error":"..."}` with appropriate status codes.

Errors are logged but never crash the server.

## SSE

`GET /sse`

Server pushes a `data: ping\n\n` message on every successful ingest. The dashboard's `useSSE` hook listens and triggers a refetch of `/api/summary`. No event payload in the SSE message — just a signal to refresh.

## Summary API

`GET /api/summary?range=today|7d|30d`

Returns aggregated data for all four dashboard views in one response:

```typescript
{
  today: {
    cost_usd: number,
    input_tokens: number,
    output_tokens: number,
    by_model: { model: string, cost_usd: number, tokens: number }[],
    top_tools: { tool: string, cost_usd: number, calls: number }[]
  },
  by_model: { model: string, cost_usd: number, tokens: number, days: {...}[] }[],
  by_tool:  { tool: string, calls: number, input_tokens: number, output_tokens: number, cost_usd: number, avg_latency_ms: number }[],
  by_project: { project: string, calls: number, cost_usd: number, avg_latency_ms: number }[]
}
```

## vault-daemon Client

New file `src/observatory-client.ts` in vault-daemon:

```typescript
const INGEST_URL = process.env.OBSERVATORY_INGEST_URL ?? "http://localhost:3099/api/ingest";
const INGEST_SECRET = process.env.LITELLM_CALLBACK_SECRET ?? "litellm-webhook-secret";

export function ingestEvent(payload: Record<string, unknown>): void {
  fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-litellm-signature": INGEST_SECRET },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
```

Then `gemini.ts` and `leonardo.ts` import from `./observatory-client.js` and call `ingestEvent()` with the full payload including `project: "vault-daemon"`, `tool`, `model`, `cost_usd`, etc.

## Auth

`x-litellm-signature` header checked against `LITELLM_CALLBACK_SECRET` env var. Secret loaded from Keychain at launchd spawn (same pattern as vault-daemon-http-wrap). Requests without the correct header → 401.

Dashboard at `http://localhost:3099` has no auth — localhost only.

## launchd

`com.micahbos.observatory.plist` — KeepAlive, Aqua session, loads secrets from Keychain (LITELLM_CALLBACK_SECRET), runs `node dist/index.js` from `~/Developer/observatory/server/`.

## Tech Stack

| Layer | Technology |
|---|---|
| Server | TypeScript, Node 20+, Hono, better-sqlite3 |
| Dashboard | Vite, React, Recharts (charts), TailwindCSS |
| Storage | SQLite (single file, no infra) |
| Process | launchd KeepAlive on port 3099 |
| Build | tsc (server), vite build (dashboard → server/public/) |

## Out of Scope (v1)

- Remote hosting / cloud sync
- Alert thresholds / budget enforcement
- burn0 ledger ingestion (burn0 stays as auto-interceptor, observatory is the explicit layer)
- Authentication on the dashboard
- Data retention / pruning policies
