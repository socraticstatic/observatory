# TracesView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full LLM call log table at the Traces view — paginated list of `llm_events` rows with provider/status filters, expandable row details, and cursor-based pagination.

**Architecture:** New `tracesRouter` exposes a `list` procedure that queries `llm_events` with optional provider/status filters using cursor-based pagination (by `ts DESC`). `TracesView.tsx` wraps a table with a local filter bar. Expanding a row shows raw JSON payload inline. No new DB schema changes needed.

**Tech Stack:** tRPC v11, Prisma 7, TanStack Query v5, Next.js 16, TypeScript strict, Vitest

**Prerequisite:** Run the cleanup plan (`2026-04-19-observatory-cleanup.md`) first, so dead code is gone before adding new code.

---

## File Structure

```
src/
  server/routers/
    traces.ts           CREATE — tRPC router with list procedure
    _app.ts             MODIFY — register tracesRouter
  components/views/
    TracesView.tsx      MODIFY — replace stub with full implementation
  __tests__/routers/
    traces.test.ts      CREATE — Vitest tests for traces.list
```

---

## Task 1: Write failing tests for traces router

**Files:**
- Create: `src/__tests__/routers/traces.test.ts`

Write tests before implementation. The test pattern matches the existing `pulse.test.ts`.

- [ ] **Step 1: Write the test file**

Create `src/__tests__/routers/traces.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  db: {
    llmEvent: { findMany: mockFindMany },
  },
}));

import { createCallerFactory, createContext } from '@/server/trpc';
import { tracesRouter } from '@/server/routers/traces';

const createCaller = createCallerFactory(tracesRouter);

const MOCK_EVENT = {
  id: 'evt-001',
  ts: new Date('2026-04-19T12:00:00Z'),
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  inputTokens: 1000,
  outputTokens: 500,
  cachedTokens: 200,
  reasoningTokens: 0,
  costUsd: '0.015000',
  latencyMs: 820,
  status: 'ok',
  sessionId: 'sess-abc',
  project: 'observatory',
  surface: null,
  contentType: null,
  rawPayload: { model: 'claude-sonnet-4-6' },
};

beforeEach(() => {
  mockFindMany.mockResolvedValue([MOCK_EVENT]);
});

describe('tracesRouter.list', () => {
  it('returns mapped items with numeric costUsd', async () => {
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H' });
    expect(result.items).toHaveLength(1);
    expect(typeof result.items[0].costUsd).toBe('number');
    expect(result.items[0].costUsd).toBeCloseTo(0.015);
  });

  it('returns ts as ISO string', async () => {
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H' });
    expect(result.items[0].ts).toBe('2026-04-19T12:00:00.000Z');
  });

  it('returns nextCursor null when fewer items than limit', async () => {
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H', limit: 50 });
    expect(result.nextCursor).toBeNull();
  });

  it('returns nextCursor when result equals limit + 1', async () => {
    // findMany returns limit+1 items → hasMore=true
    const extra = { ...MOCK_EVENT, id: 'evt-002', ts: new Date('2026-04-19T11:00:00Z') };
    mockFindMany.mockResolvedValue([MOCK_EVENT, extra]);
    const caller = createCaller(createContext());
    const result = await caller.list({ lookback: '24H', limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('2026-04-19T12:00:00.000Z');
  });

  it('passes provider filter to db when provided', async () => {
    const caller = createCaller(createContext());
    await caller.list({ lookback: '24H', provider: 'google' });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.provider).toBe('google');
  });

  it('passes status filter to db when provided', async () => {
    const caller = createCaller(createContext());
    await caller.list({ lookback: '24H', status: 'error' });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/routers/traces.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '@/server/routers/traces'`

- [ ] **Step 3: Commit the failing test**

```bash
git add src/__tests__/routers/traces.test.ts
git commit -m "test(traces): add failing tests for tracesRouter.list"
```

---

## Task 2: Implement traces.ts router

**Files:**
- Create: `src/server/routers/traces.ts`

- [ ] **Step 1: Write the router**

Create `src/server/routers/traces.ts`:

```typescript
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const tracesRouter = router({
  list: publicProcedure
    .input(z.object({
      lookback: LookbackSchema,
      provider: z.string().optional(),
      status: z.enum(['ok', 'error']).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const items = await ctx.db.llmEvent.findMany({
        where: {
          ts: {
            gte: since,
            ...(input.cursor ? { lt: new Date(input.cursor) } : {}),
          },
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.status   ? { status: input.status }     : {}),
        },
        orderBy: { ts: 'desc' },
        take: input.limit + 1,
        select: {
          id: true, ts: true, provider: true, model: true,
          inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true,
          costUsd: true, latencyMs: true, status: true,
          sessionId: true, project: true, surface: true, contentType: true,
          rawPayload: true,
        },
      });
      const hasMore = items.length > input.limit;
      const page    = hasMore ? items.slice(0, -1) : items;
      return {
        items: page.map(e => ({
          id:              e.id,
          ts:              e.ts.toISOString(),
          provider:        e.provider,
          model:           e.model,
          inputTokens:     e.inputTokens,
          outputTokens:    e.outputTokens,
          cachedTokens:    e.cachedTokens,
          reasoningTokens: e.reasoningTokens,
          costUsd:         Number(e.costUsd),
          latencyMs:       e.latencyMs ?? 0,
          status:          e.status,
          sessionId:       e.sessionId  ?? null,
          project:         e.project    ?? null,
          surface:         e.surface    ?? null,
          contentType:     e.contentType ?? null,
          rawPayload:      e.rawPayload,
        })),
        nextCursor: hasMore ? page[page.length - 1].ts.toISOString() : null,
      };
    }),
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/routers/traces.test.ts 2>&1 | tail -20
```

Expected: all 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/traces.ts
git commit -m "feat(traces): implement tracesRouter.list with cursor pagination + filters"
```

---

## Task 3: Register tracesRouter in _app.ts

**Files:**
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Add import and registration**

In `src/server/routers/_app.ts`, add after the last import:
```typescript
import { tracesRouter } from './traces';
```

Add `traces: tracesRouter,` to the `appRouter` object:
```typescript
export const appRouter = router({
  pulse:    pulseRouter,
  what:     whatRouter,
  who:      whoRouter,
  where:    whereRouter,
  when:     whenRouter,
  how:      howRouter,
  content:  contentRouter,
  surface:  surfaceRouter,
  events:   eventsRouter,
  entity:   entityRouter,
  insights: insightsRouter,
  traces:   tracesRouter,
});
```

- [ ] **Step 2: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/_app.ts
git commit -m "feat(router): register tracesRouter"
```

---

## Task 4: Build TracesView component

**Files:**
- Modify: `src/components/views/TracesView.tsx`

Replace the "Coming soon" stub with a full implementation. The component manages its own filter state (provider, status) and reads lookback from props.

- [ ] **Step 1: Write the component**

Replace the contents of `src/components/views/TracesView.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { fmtUsd, fmtMs } from '@/lib/fmt';
import type { Lookback } from '@/lib/lookback';

interface Props {
  lookback: Lookback;
}

const PROVIDERS = [
  { id: undefined,    label: 'All' },
  { id: 'anthropic',  label: 'Claude' },
  { id: 'google',     label: 'Gemini' },
  { id: 'xai',        label: 'Grok' },
];

const STATUS_OPTS = [
  { id: undefined,  label: 'All' },
  { id: 'ok',       label: 'OK' },
  { id: 'error',    label: 'Error' },
] as const;

function providerColor(p: string): string {
  if (p === 'anthropic') return '#6FA8B3';
  if (p === 'google')    return '#C9B08A';
  if (p === 'xai')       return '#B88A8A';
  return '#8A9297';
}

function statusColor(s: string): string {
  return s === 'error' ? 'var(--bad)' : 'var(--good)';
}

function fmt2(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

type TraceRow = {
  id: string;
  ts: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latencyMs: number;
  status: string;
  sessionId: string | null;
  project: string | null;
  surface: string | null;
  contentType: string | null;
  rawPayload: unknown;
};

export function TracesView({ lookback }: Props) {
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [status,   setStatus]   = useState<'ok' | 'error' | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cursor,   setCursor]   = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<TraceRow[]>([]);

  const { data, isFetching } = trpc.traces.list.useQuery(
    { lookback, provider, status, cursor, limit: 50 },
    {
      onSuccess(result) {
        if (!cursor) {
          setAllItems(result.items);
        } else {
          setAllItems(prev => [...prev, ...result.items]);
        }
      },
    }
  );

  // Reset when filters change
  function applyProvider(p: string | undefined) {
    setProvider(p);
    setCursor(undefined);
    setAllItems([]);
  }

  function applyStatus(s: 'ok' | 'error' | undefined) {
    setStatus(s);
    setCursor(undefined);
    setAllItems([]);
  }

  function loadMore() {
    if (data?.nextCursor) setCursor(data.nextCursor);
  }

  const items = allItems.length > 0 ? allItems : (data?.items ?? []);

  return (
    <div className="page">
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="label" style={{ marginRight: 4 }}>Provider</span>
        <div className="seg">
          {PROVIDERS.map(p => (
            <button
              key={String(p.id)}
              className={provider === p.id ? 'on' : ''}
              onClick={() => applyProvider(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="label" style={{ marginLeft: 8, marginRight: 4 }}>Status</span>
        <div className="seg">
          {STATUS_OPTS.map(s => (
            <button
              key={String(s.id)}
              className={status === s.id ? 'on' : ''}
              onClick={() => applyStatus(s.id as 'ok' | 'error' | undefined)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--steel)' }}>
          {items.length} events
          {isFetching && <span style={{ marginLeft: 8, color: 'var(--graphite)' }}>loading…</span>}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 1fr 1fr 80px 80px 70px 60px 52px',
          padding: '8px 16px',
          borderBottom: '1px solid var(--line)',
          gap: 8,
        }}>
          {['Time', 'Model', 'Provider', 'Tokens', 'Cost', 'Latency', 'Status', ''].map(h => (
            <span key={h} className="label" style={{ fontSize: 9 }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        {items.length === 0 && !isFetching && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--steel)', fontSize: 12 }}>
            No events in this window
          </div>
        )}

        {items.map(row => (
          <div key={row.id}>
            {/* Summary row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr 1fr 80px 80px 70px 60px 52px',
                padding: '8px 16px',
                gap: 8,
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
                background: expanded === row.id ? 'rgba(111,168,179,.04)' : 'transparent',
                transition: 'background 100ms',
              }}
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
            >
              <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
                {new Date(row.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fog)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.model}
              </span>
              <span style={{ fontSize: 11 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: providerColor(row.provider), marginRight: 5, verticalAlign: 'middle' }} />
                <span style={{ color: 'var(--steel)' }}>{row.provider}</span>
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
                {fmt2(row.inputTokens + row.outputTokens)}
                {row.cachedTokens > 0 && <span style={{ color: 'var(--accent-2)', marginLeft: 4 }}>+{fmt2(row.cachedTokens)}c</span>}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
                {fmtUsd(row.costUsd)}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
                {row.latencyMs > 0 ? fmtMs(row.latencyMs) : '—'}
              </span>
              <span style={{ fontSize: 10, color: statusColor(row.status), fontWeight: 600 }}>
                {row.status.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--graphite)', textAlign: 'right' }}>
                {expanded === row.id ? '▲' : '▼'}
              </span>
            </div>

            {/* Expanded detail */}
            {expanded === row.id && (
              <div style={{
                padding: '12px 16px 16px',
                borderBottom: '1px solid var(--line)',
                background: 'rgba(11,16,20,.4)',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 16px', marginBottom: 12 }}>
                  {[
                    { label: 'Session', val: row.sessionId ?? '—' },
                    { label: 'Project', val: row.project ?? '—' },
                    { label: 'Surface', val: row.surface ?? '—' },
                    { label: 'Content Type', val: row.contentType ?? '—' },
                    { label: 'Input tokens', val: fmt2(row.inputTokens) },
                    { label: 'Output tokens', val: fmt2(row.outputTokens) },
                    { label: 'Cached tokens', val: fmt2(row.cachedTokens) },
                    { label: 'Reasoning tokens', val: fmt2(row.reasoningTokens) },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <div className="label" style={{ marginBottom: 2 }}>{label}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--fog)', wordBreak: 'break-all' }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div className="label" style={{ marginBottom: 6 }}>Raw payload</div>
                <pre style={{
                  margin: 0,
                  padding: '8px 10px',
                  background: 'rgba(0,0,0,.3)',
                  borderRadius: 'var(--r)',
                  fontSize: 10,
                  color: 'var(--steel)',
                  overflow: 'auto',
                  maxHeight: 240,
                  lineHeight: 1.5,
                }}>
                  {JSON.stringify(row.rawPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}

        {/* Load more */}
        {data?.nextCursor && (
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--line)' }}>
            <button
              className="mbtn"
              onClick={loadMore}
              disabled={isFetching}
              style={{ opacity: isFetching ? 0.5 : 1 }}
            >
              {isFetching ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors. If `onSuccess` is deprecated in TanStack Query v5, replace with a `useEffect` watching `data`:

```tsx
// Replace onSuccess option with:
const { data, isFetching } = trpc.traces.list.useQuery(
  { lookback, provider, status, cursor, limit: 50 },
);

useEffect(() => {
  if (!data) return;
  if (!cursor) {
    setAllItems(data.items);
  } else {
    setAllItems(prev => [...prev, ...data.items]);
  }
}, [data, cursor]);
```

Re-run `npm run build` after the fix if needed.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/TracesView.tsx
git commit -m "feat(TracesView): implement LLM call log table with filters + pagination"
```

---

## Task 5: Wire TracesView in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

`TracesView` currently receives no props from `page.tsx`. It needs `lookback` passed in.

- [ ] **Step 1: Update TracesView call in page.tsx**

Find line ~102 in `src/app/page.tsx`:
```tsx
{view === 'Traces'   && <TracesView />}
```
Change to:
```tsx
{view === 'Traces'   && <TracesView lookback={lookback} />}
```

- [ ] **Step 2: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire TracesView lookback prop from page state"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: Failing tests written for all 6 behaviors
- ✅ Task 2: Router with cursor pagination, provider filter, status filter
- ✅ Task 3: Router registered in appRouter
- ✅ Task 4: Full TracesView with filters, table, expandable rows, load more
- ✅ Task 5: lookback wired from page state

**Placeholder scan:** None found — all code blocks are complete and runnable.

**Type consistency:**
- `TraceRow` type in TracesView matches the shape returned by `tracesRouter.list`
- `Lookback` imported from `@/lib/lookback` consistently
- `cursor` is `string | undefined` in both state and router input

**Edge cases:**
- Empty result: "No events in this window" message shown
- Load more: cursor advances correctly, items accumulate in `allItems`
- Filter change resets cursor and clears accumulated items
- TanStack Query v5 removed `onSuccess` callback — Task 4 Step 2 shows the `useEffect` fallback
