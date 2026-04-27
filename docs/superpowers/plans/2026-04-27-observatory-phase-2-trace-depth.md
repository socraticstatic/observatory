# Observatory Phase 2 — Trace Depth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add parent-child span relationships to LlmEvent and render a collapsible trace tree in TracesView; add a second ingest endpoint that accepts standard OpenTelemetry span payloads and maps them to the existing LlmEvent schema.

**Architecture:** Two independent features. The trace tree requires a schema migration (spanId, parentSpanId), a tree-assembly utility, a tRPC `listTree` procedure on `tracesRouter`, and a `TraceTreeRow` component. The OTel endpoint is a new Next.js route handler (`/api/ingest/otel`) that parses `ResourceSpans` payloads and reuses the existing `db.llmEvent.create` pipeline. Both share the same `LlmEvent` model.

**Tech Stack:** Next.js 16.2.4, tRPC v11.16, Prisma 7.7, PostgreSQL 16, Vitest 4.1.4, TypeScript 5 strict

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add spanId, parentSpanId to LlmEvent |
| `src/lib/ingest.ts` | Modify | Extract spanId/parentSpanId from LiteLLM payload |
| `src/lib/otel-ingest.ts` | Create | OTel ResourceSpans → NormalizedEvent parser |
| `src/server/routers/traces.ts` | Modify | Add listTree procedure |
| `src/app/api/ingest/otel/route.ts` | Create | POST /api/ingest/otel handler |
| `src/components/views/TracesView.tsx` | Modify | Add Flat/Tree toggle; render TraceTreeRow |
| `src/components/traces/TraceTreeRow.tsx` | Create | Collapsible tree row component |
| `src/__tests__/routers/traces.test.ts` | Modify | Add tree-mode tests |
| `src/__tests__/lib/otel-ingest.test.ts` | Create | OTel parser unit tests |

---

### Task 1: Add spanId / parentSpanId to LlmEvent schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/ingest.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/lib/ingest.test.ts` (file from Phase 1, or create it if Phase 1 wasn't run), add:

```typescript
describe('parseIngestPayload — span fields', () => {
  it('extracts spanId from body.id', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      id: 'span-abc-001',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.spanId).toBe('span-abc-001');
  });

  it('extracts parentSpanId from body.parent_id', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      id: 'span-child',
      parent_id: 'span-root',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.spanId).toBe('span-child');
    expect(result?.parentSpanId).toBe('span-root');
  });

  it('returns undefined for spanId when not provided', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.spanId).toBeUndefined();
    expect(result?.parentSpanId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npm test -- ingest --reporter=verbose 2>&1 | grep -E "(spanId|FAIL)"
```

Expected: FAIL — `spanId` not on `NormalizedEvent`.

- [ ] **Step 3: Add columns to schema.prisma**

In the `LlmEvent` model, add after `sessionId`:

```prisma
spanId       String?  @map("span_id")
parentSpanId String?  @map("parent_span_id")
```

Add a parentSpanId index:

```prisma
@@index([parentSpanId])
```

- [ ] **Step 4: Push schema**

```bash
npx prisma db push && npx prisma generate
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Update NormalizedEvent and parseIngestPayload**

In `src/lib/ingest.ts`, add to the `NormalizedEvent` interface:

```typescript
export interface NormalizedEvent {
  provider: string;
  model: string;
  surface?: string;
  sessionId?: string;
  userId?: string;
  spanId?: string;        // ← add
  parentSpanId?: string;  // ← add
  project?: string;
  // ... rest unchanged
}
```

In `parseIngestPayload`, extract the span fields (add near the sessionId extraction, around line 78):

```typescript
const spanId:       string | undefined = body.id       ?? undefined;
const parentSpanId: string | undefined = body.parent_id ?? undefined;
```

Add to the return object:

```typescript
return {
  provider,
  model,
  surface,
  sessionId,
  userId,
  spanId,
  parentSpanId,
  project,
  // ... rest unchanged
};
```

- [ ] **Step 6: Run tests**

```bash
npm test -- ingest --reporter=verbose
```

Expected: all span tests PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/ingest.ts src/__tests__/lib/ingest.test.ts
git commit -m "feat: spanId/parentSpanId on LlmEvent — schema + ingest extraction"
```

---

### Task 2: Tree-assembly utility + tracesRouter.listTree

**Files:**
- Modify: `src/server/routers/traces.ts`
- Modify: `src/__tests__/routers/traces.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/routers/traces.test.ts`:

```typescript
describe('tracesRouter.listTree', () => {
  it('returns root spans with nested children', async () => {
    const ROOT_EVENT = {
      id: 'root-1', ts: new Date('2026-04-27T10:00:00Z'),
      provider: 'anthropic', model: 'claude-sonnet-4-6',
      spanId: 'span-root', parentSpanId: null,
      inputTokens: 500, outputTokens: 200, cachedTokens: 0, reasoningTokens: 0,
      costUsd: '0.001', latencyMs: 800, status: 'ok',
      surface: null, project: 'test', sessionId: 'sess-1', userId: null,
      contentType: null, qualityScore: null, billingUnit: 'tokens',
    };
    const CHILD_EVENT = {
      ...ROOT_EVENT, id: 'child-1',
      spanId: 'span-child', parentSpanId: 'span-root',
      inputTokens: 100, outputTokens: 50,
    };

    mockFindMany.mockResolvedValue([ROOT_EVENT, CHILD_EVENT]);

    const result = await caller.listTree({ lookback: '24H' });

    expect(result).toHaveLength(1); // only root
    expect(result[0].id).toBe('root-1');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe('child-1');
  });

  it('returns flat list when no parent-child relationships exist', async () => {
    const EVENT_A = {
      id: 'a-1', ts: new Date(), provider: 'anthropic', model: 'claude-haiku-4-5-20251001',
      spanId: null, parentSpanId: null,
      inputTokens: 200, outputTokens: 80, cachedTokens: 0, reasoningTokens: 0,
      costUsd: '0.0002', latencyMs: 300, status: 'ok',
      surface: null, project: null, sessionId: null, userId: null,
      contentType: null, qualityScore: null, billingUnit: 'tokens',
    };
    mockFindMany.mockResolvedValue([EVENT_A]);

    const result = await caller.listTree({ lookback: '24H' });

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- traces --reporter=verbose 2>&1 | grep -E "(listTree|FAIL)"
```

Expected: FAIL — `listTree` procedure does not exist.

- [ ] **Step 3: Add listTree to tracesRouter**

In `src/server/routers/traces.ts`, add the tree-assembly utility function above the router export:

```typescript
// Tree types
interface TraceNode {
  id: string;
  ts: string;
  provider: string;
  model: string;
  spanId: string | null;
  parentSpanId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latencyMs: number | null;
  status: string;
  surface: string | null;
  project: string | null;
  sessionId: string | null;
  userId: string | null;
  children: TraceNode[];
}

function assembleTree(events: Array<{
  id: string; ts: Date; provider: string; model: string;
  spanId: string | null; parentSpanId: string | null;
  inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens: number;
  costUsd: unknown; latencyMs: number | null; status: string;
  surface: string | null; project: string | null; sessionId: string | null; userId: string | null;
}>): TraceNode[] {
  const nodeMap = new Map<string, TraceNode>();
  const roots: TraceNode[] = [];

  // First pass: build node map
  for (const e of events) {
    const node: TraceNode = {
      id: e.id,
      ts: e.ts.toISOString(),
      provider: e.provider,
      model: e.model,
      spanId: e.spanId,
      parentSpanId: e.parentSpanId,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      cachedTokens: e.cachedTokens,
      reasoningTokens: e.reasoningTokens,
      costUsd: Number(e.costUsd),
      latencyMs: e.latencyMs,
      status: e.status,
      surface: e.surface,
      project: e.project,
      sessionId: e.sessionId,
      userId: e.userId,
      children: [],
    };
    nodeMap.set(e.id, node);
    if (e.spanId) nodeMap.set(e.spanId, node); // also index by spanId
  }

  // Second pass: link children to parents (max 5 levels deep)
  for (const e of events) {
    const node = nodeMap.get(e.id)!;
    const parentNode = e.parentSpanId ? nodeMap.get(e.parentSpanId) : null;
    if (parentNode && parentNode !== node) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
```

Then add the `listTree` procedure to the router (after the existing `list` procedure):

```typescript
listTree: publicProcedure
  .input(z.object({
    lookback: LookbackSchema,
    provider: z.string().optional(),
    project:  z.string().optional(),
  }))
  .query(async ({ ctx, input }) => {
    const since = new Date(Date.now() - lookbackToMs(input.lookback));
    const where = {
      ts:       { gte: since },
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.project  ? { project:  input.project  } : {}),
    };
    const events = await ctx.db.llmEvent.findMany({
      where,
      orderBy: { ts: 'asc' },
      take: 500, // cap for tree mode
      select: {
        id: true, ts: true, provider: true, model: true,
        spanId: true, parentSpanId: true,
        inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true,
        costUsd: true, latencyMs: true, status: true,
        surface: true, project: true, sessionId: true, userId: true,
      },
    });
    return assembleTree(events);
  }),
```

Make sure `lookbackToMs` is defined (or extract from `lookbackToInterval` — add a helper if needed):

```typescript
function lookbackToMs(lookback: string): number {
  const map: Record<string, number> = {
    '1H': 3_600_000, '24H': 86_400_000, '30D': 30 * 86_400_000,
    '90D': 90 * 86_400_000, '1Y': 365 * 86_400_000,
  };
  return map[lookback] ?? 86_400_000;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- traces --reporter=verbose
```

Expected: all tests including `listTree` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/traces.ts src/__tests__/routers/traces.test.ts
git commit -m "feat: tracesRouter.listTree with recursive tree assembly"
```

---

### Task 3: TraceTreeRow component

**Files:**
- Create: `src/components/traces/TraceTreeRow.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/traces/TraceTreeRow.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { fmtMs, fmtUsd } from '@/lib/fmt';

interface TraceNode {
  id: string;
  ts: string;
  provider: string;
  model: string;
  spanId: string | null;
  parentSpanId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  latencyMs: number | null;
  status: string;
  surface: string | null;
  project: string | null;
  sessionId: string | null;
  children: TraceNode[];
}

interface Props {
  node: TraceNode;
  depth?: number;
  maxLatMs?: number;
}

export function TraceTreeRow({ node, depth = 0, maxLatMs = 1 }: Props) {
  const [open, setOpen] = useState(depth === 0 && node.children.length > 0);

  const isError  = node.status === 'error';
  const hasKids  = node.children.length > 0;
  const barWidth = node.latencyMs ? Math.max(2, (node.latencyMs / maxLatMs) * 80) : 0;
  const indent   = depth * 18;

  return (
    <>
      <tr
        onClick={() => hasKids && setOpen(o => !o)}
        style={{
          cursor: hasKids ? 'pointer' : 'default',
          borderBottom: '1px solid var(--line-2)',
          background: depth % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
        }}
      >
        {/* Depth indent + expand toggle */}
        <td style={{ paddingLeft: 12 + indent, paddingTop: 6, paddingBottom: 6, width: '30%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasKids && (
              <span className="mono" style={{ fontSize: 9, color: 'var(--steel)', width: 10 }}>
                {open ? '▼' : '▶'}
              </span>
            )}
            {!hasKids && <span style={{ width: 10 }} />}
            <span className="mono" style={{ fontSize: 11, color: isError ? 'var(--bad)' : 'var(--fog)' }}>
              {node.model.split('/').pop()}
            </span>
            {node.project && (
              <span className="mono" style={{ fontSize: 9, color: 'var(--steel)' }}>
                {node.project}
              </span>
            )}
          </div>
        </td>

        {/* Latency bar */}
        <td style={{ paddingTop: 6, paddingBottom: 6, width: '25%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: `${barWidth}%`, height: 4, borderRadius: 2,
              background: isError ? 'var(--bad)' : depth === 0 ? '#6FA8B3' : '#4A6B73',
              minWidth: 2,
            }} />
            <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
              {node.latencyMs ? fmtMs(node.latencyMs) : '—'}
            </span>
          </div>
        </td>

        {/* Tokens */}
        <td style={{ paddingTop: 6, paddingBottom: 6, width: '25%' }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--graphite)' }}>
            {(node.inputTokens + node.outputTokens).toLocaleString()}
            {node.cachedTokens > 0 && (
              <span style={{ color: 'var(--accent-2)' }}> · {node.cachedTokens.toLocaleString()} cached</span>
            )}
          </span>
        </td>

        {/* Cost */}
        <td style={{ paddingTop: 6, paddingBottom: 6, textAlign: 'right', paddingRight: 12 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fog)' }}>
            {fmtUsd(node.costUsd)}
          </span>
        </td>
      </tr>

      {/* Children (recursive) */}
      {open && node.children.map(child => (
        <TraceTreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          maxLatMs={maxLatMs}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/traces/TraceTreeRow.tsx
git commit -m "feat: TraceTreeRow — collapsible hierarchical trace visualization"
```

---

### Task 4: Add Flat/Tree toggle to TracesView

**Files:**
- Modify: `src/components/views/TracesView.tsx`

- [ ] **Step 1: Read current TracesView structure**

```bash
head -80 /Users/micahbos/Desktop/cloud-router-ui/observatory/src/components/views/TracesView.tsx
```

- [ ] **Step 2: Add treeMode state and query**

At the top of the `TracesView` component function, add:

```tsx
const [treeMode, setTreeMode] = useState(false);
const { data: treeData } = trpc.traces.listTree.useQuery(
  { lookback, provider },
  { enabled: treeMode }
);
```

- [ ] **Step 3: Add Flat/Tree toggle button**

Find the filter controls row at the top of the view. Add a toggle after the existing filter controls:

```tsx
{/* Flat / Tree toggle */}
<div style={{ display: 'flex', gap: 1, marginLeft: 'auto' }}>
  {(['Flat', 'Tree'] as const).map(mode => (
    <button
      key={mode}
      onClick={() => setTreeMode(mode === 'Tree')}
      className={treeMode === (mode === 'Tree') ? 'btn-primary' : 'btn-secondary'}
      style={{ fontSize: 10, padding: '4px 10px', borderRadius: mode === 'Flat' ? '4px 0 0 4px' : '0 4px 4px 0' }}
    >
      {mode}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Render TraceTreeRow in tree mode**

Find the existing table body that renders trace rows. Conditionally render tree mode:

```tsx
{treeMode ? (
  // Tree mode
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead>
      <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
        <th className="label" style={{ textAlign: 'left', padding: '6px 12px', fontWeight: 400, width: '30%' }}>MODEL · PROJECT</th>
        <th className="label" style={{ textAlign: 'left', padding: '6px 0', fontWeight: 400, width: '25%' }}>LATENCY</th>
        <th className="label" style={{ textAlign: 'left', padding: '6px 0', fontWeight: 400, width: '25%' }}>TOKENS</th>
        <th className="label" style={{ textAlign: 'right', padding: '6px 12px', fontWeight: 400 }}>COST</th>
      </tr>
    </thead>
    <tbody>
      {(treeData ?? []).map(root => {
        const maxLat = Math.max(1, root.latencyMs ?? 1, ...root.children.map(c => c.latencyMs ?? 0));
        return (
          <TraceTreeRow key={root.id} node={root} depth={0} maxLatMs={maxLat} />
        );
      })}
    </tbody>
  </table>
) : (
  // Flat mode — existing trace table (unchanged)
  <existing flat trace table JSX>
)}
```

Import `TraceTreeRow` at the top of the file:

```tsx
import { TraceTreeRow } from '@/components/traces/TraceTreeRow';
```

- [ ] **Step 5: Verify in browser**

```bash
npm run dev
# Navigate to Traces — confirm Flat/Tree toggle appears
# Click Tree — tree table renders (empty if no span relationships in seed data)
```

- [ ] **Step 6: Commit**

```bash
git add src/components/views/TracesView.tsx
git commit -m "feat: Flat/Tree toggle in TracesView with collapsible span tree"
```

---

### Task 5: OTel ingest parser

**Files:**
- Create: `src/lib/otel-ingest.ts`
- Create: `src/__tests__/lib/otel-ingest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/otel-ingest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseOtelPayload } from '@/lib/otel-ingest';

// Minimal OTel ResourceSpans payload following gen_ai semantic conventions
const SAMPLE_OTEL = {
  resourceSpans: [{
    resource: {
      attributes: [{ key: 'service.name', value: { stringValue: 'my-app' } }],
    },
    scopeSpans: [{
      spans: [{
        traceId: 'aabbccddeeff00112233445566778899',
        spanId:  '0011223344556677',
        parentSpanId: '',
        name: 'chat claude-sonnet-4-6',
        startTimeUnixNano: '1745800000000000000',
        endTimeUnixNano:   '1745800001200000000',
        attributes: [
          { key: 'gen_ai.system',                value: { stringValue: 'anthropic' } },
          { key: 'gen_ai.request.model',         value: { stringValue: 'claude-sonnet-4-6' } },
          { key: 'gen_ai.usage.input_tokens',    value: { intValue: 512 } },
          { key: 'gen_ai.usage.output_tokens',   value: { intValue: 128 } },
          { key: 'gen_ai.usage.cache_read_input_tokens', value: { intValue: 256 } },
          { key: 'session.id',                   value: { stringValue: 'sess-otel-123' } },
          { key: 'user.id',                      value: { stringValue: 'user-42' } },
        ],
        status: { code: 1 }, // STATUS_CODE_OK
      }],
    }],
  }],
};

describe('parseOtelPayload', () => {
  it('parses a ResourceSpans payload into NormalizedEvent array', () => {
    const results = parseOtelPayload(SAMPLE_OTEL);
    expect(results).toHaveLength(1);
    const ev = results[0];
    expect(ev.provider).toBe('anthropic');
    expect(ev.model).toBe('claude-sonnet-4-6');
    expect(ev.inputTokens).toBe(512);
    expect(ev.outputTokens).toBe(128);
    expect(ev.cachedTokens).toBe(256);
    expect(ev.sessionId).toBe('sess-otel-123');
    expect(ev.userId).toBe('user-42');
    expect(ev.latencyMs).toBe(1200); // 1.2 seconds
    expect(ev.spanId).toBe('0011223344556677');
    expect(ev.parentSpanId).toBeUndefined(); // empty string → undefined
  });

  it('sets parentSpanId when span has a non-empty parentSpanId', () => {
    const payload = JSON.parse(JSON.stringify(SAMPLE_OTEL));
    payload.resourceSpans[0].scopeSpans[0].spans[0].parentSpanId = 'aabbccdd11223344';
    const results = parseOtelPayload(payload);
    expect(results[0].parentSpanId).toBe('aabbccdd11223344');
  });

  it('maps traceId to sessionId when session.id attribute is absent', () => {
    const payload = JSON.parse(JSON.stringify(SAMPLE_OTEL));
    payload.resourceSpans[0].scopeSpans[0].spans[0].attributes =
      payload.resourceSpans[0].scopeSpans[0].spans[0].attributes.filter(
        (a: { key: string }) => a.key !== 'session.id'
      );
    const results = parseOtelPayload(payload);
    expect(results[0].sessionId).toBe('aabbccddeeff00112233445566778899');
  });

  it('returns empty array for invalid payload', () => {
    expect(parseOtelPayload(null)).toEqual([]);
    expect(parseOtelPayload({})).toEqual([]);
    expect(parseOtelPayload({ resourceSpans: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- otel-ingest --reporter=verbose 2>&1 | tail -10
```

Expected: FAIL — `parseOtelPayload` module not found.

- [ ] **Step 3: Implement `src/lib/otel-ingest.ts`**

```typescript
// src/lib/otel-ingest.ts
// Parses OpenTelemetry ResourceSpans JSON export → NormalizedEvent[]
// Follows OTel GenAI semantic conventions v1.0.0

import { type NormalizedEvent } from './ingest';
import { getBillingUnit } from './service-registry';

type AttrValue = { stringValue?: string; intValue?: number; doubleValue?: number; boolValue?: boolean };
type Attribute  = { key: string; value: AttrValue };

function getAttr(attrs: Attribute[], key: string): string | number | undefined {
  const a = attrs.find(a => a.key === key);
  if (!a) return undefined;
  const v = a.value;
  return v.stringValue ?? v.intValue ?? v.doubleValue;
}

function inferProvider(system: string | undefined, model: string): string {
  if (system) return system.toLowerCase();
  if (model.includes('claude'))  return 'anthropic';
  if (model.includes('gemini'))  return 'google';
  if (model.includes('grok'))    return 'xai';
  if (model.includes('llama') || model.includes('mistral')) return 'local';
  return 'unknown';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOtelPayload(body: any): NormalizedEvent[] {
  if (!body || typeof body !== 'object') return [];
  const resourceSpans = body.resourceSpans;
  if (!Array.isArray(resourceSpans) || resourceSpans.length === 0) return [];

  const results: NormalizedEvent[] = [];

  for (const rs of resourceSpans) {
    for (const ss of (rs.scopeSpans ?? [])) {
      for (const span of (ss.spans ?? [])) {
        const attrs: Attribute[] = span.attributes ?? [];

        const system  = getAttr(attrs, 'gen_ai.system') as string | undefined;
        const model   = (getAttr(attrs, 'gen_ai.request.model') as string | undefined) ?? '';
        if (!model) continue; // skip non-LLM spans

        const provider        = inferProvider(system, model);
        const inputTokens     = Number(getAttr(attrs, 'gen_ai.usage.input_tokens')               ?? 0);
        const outputTokens    = Number(getAttr(attrs, 'gen_ai.usage.output_tokens')              ?? 0);
        const cachedTokens    = Number(getAttr(attrs, 'gen_ai.usage.cache_read_input_tokens')    ?? 0);
        const cacheCreationTokens = Number(getAttr(attrs, 'gen_ai.usage.cache_creation_input_tokens') ?? 0);
        const reasoningTokens = Number(getAttr(attrs, 'gen_ai.usage.thinking_tokens')            ?? 0);

        // Compute latency from span timing (nanoseconds → milliseconds)
        const startNs = Number(BigInt(span.startTimeUnixNano ?? 0));
        const endNs   = Number(BigInt(span.endTimeUnixNano   ?? 0));
        const latencyMs = endNs > startNs ? Math.round((endNs - startNs) / 1_000_000) : undefined;

        const sessionAttr = getAttr(attrs, 'session.id') as string | undefined;
        const sessionId   = sessionAttr || (span.traceId as string | undefined);
        const userId      = getAttr(attrs, 'user.id')   as string | undefined;
        const project     = getAttr(attrs, 'project')   as string | undefined;
        const surface     = getAttr(attrs, 'surface')   as string | undefined;

        const spanId       = span.spanId       as string | undefined;
        const parentSpanId = (span.parentSpanId && span.parentSpanId !== '')
          ? (span.parentSpanId as string)
          : undefined;

        const isError = span.status?.code === 2; // STATUS_CODE_ERROR
        const status  = isError ? 'error' : 'ok';

        results.push({
          provider,
          model,
          surface,
          sessionId,
          userId,
          spanId,
          parentSpanId,
          project,
          inputTokens,
          outputTokens,
          reasoningTokens,
          cachedTokens,
          cacheCreationTokens,
          costUsd:     '0', // OTel doesn't carry cost — will be computed by pricing fallback
          latencyMs,
          status,
          contentType: undefined,
          billingUnit: getBillingUnit(provider),
          rawPayload:  span,
        });
      }
    }
  }

  return results;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- otel-ingest --reporter=verbose
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/otel-ingest.ts src/__tests__/lib/otel-ingest.test.ts
git commit -m "feat: OTel ResourceSpans parser (gen_ai semantic conventions)"
```

---

### Task 6: POST /api/ingest/otel route handler

**Files:**
- Create: `src/app/api/ingest/otel/route.ts`

- [ ] **Step 1: Create the handler**

```typescript
// src/app/api/ingest/otel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { parseOtelPayload } from '@/lib/otel-ingest';
import { calcCost } from '@/lib/pricing';

export async function POST(req: NextRequest) {
  // Auth — same secret as the LiteLLM webhook
  const secret   = req.headers.get('x-otel-secret') ?? req.headers.get('authorization');
  const expected = process.env.LITELLM_CALLBACK_SECRET;
  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events = parseOtelPayload(body);
  if (events.length === 0) {
    return NextResponse.json({ error: 'No parseable spans found' }, { status: 422 });
  }

  let created = 0;
  let duplicates = 0;

  for (const event of events) {
    // Apply cost fallback for events that didn't carry response_cost
    if (event.costUsd === '0') {
      event.costUsd = calcCost({
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        reasoningTokens: event.reasoningTokens,
        cachedTokens: event.cachedTokens,
        cacheCreationTokens: event.cacheCreationTokens,
      });
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.llmEvent.create({ data: event as any });
      created++;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        duplicates++;
      } else {
        throw err;
      }
    }
  }

  return NextResponse.json({ ok: true, created, duplicates });
}
```

- [ ] **Step 2: Test the endpoint manually**

```bash
npm run dev &
sleep 3

curl -s -X POST http://localhost:3099/api/ingest/otel \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": { "attributes": [] },
      "scopeSpans": [{
        "spans": [{
          "traceId": "abc123",
          "spanId": "def456",
          "parentSpanId": "",
          "name": "chat",
          "startTimeUnixNano": "1745800000000000000",
          "endTimeUnixNano": "1745800001000000000",
          "attributes": [
            { "key": "gen_ai.system", "value": { "stringValue": "anthropic" } },
            { "key": "gen_ai.request.model", "value": { "stringValue": "claude-sonnet-4-6" } },
            { "key": "gen_ai.usage.input_tokens", "value": { "intValue": 100 } },
            { "key": "gen_ai.usage.output_tokens", "value": { "intValue": 50 } }
          ],
          "status": { "code": 1 }
        }]
      }]
    }]
  }'
```

Expected response: `{"ok":true,"created":1,"duplicates":0}`

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ingest/otel/route.ts
git commit -m "feat: POST /api/ingest/otel — accept OTel ResourceSpans (gen_ai semantic conventions)"
```

---

### Task 7: Final checks + PR

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Create Phase 2 PR**

```bash
git push origin HEAD
gh pr create \
  --title "feat: Phase 2 — nested trace tree, OTel ingest endpoint (#16)" \
  --body "Implements Observatory enhancement roadmap Phase 2.

- spanId/parentSpanId on LlmEvent (ingest extraction from LiteLLM payload)
- tracesRouter.listTree — recursive tree assembly from span relationships
- TraceTreeRow component — collapsible, depth-indented, latency bar per node
- TracesView Flat/Tree toggle
- POST /api/ingest/otel — accepts OTel ResourceSpans with gen_ai semantic attributes
- OTel parser unit tests (4 tests)

Spec: docs/superpowers/specs/2026-04-27-observatory-enhancement-roadmap-design.md"
```
