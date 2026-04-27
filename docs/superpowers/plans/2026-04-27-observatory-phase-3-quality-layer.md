# Observatory Phase 3 — Quality Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline trace quality scoring (1-5 stars), a dataset-pinning system for capturing production traces as test cases, and prompt fingerprinting (hash-based prompt version tracking in cost attribution).

**Architecture:** Three independent features sharing the existing schema. Quality scoring extends the `Annotation` model (adding `score` and `traceId`) and adds an `annotation` tRPC router. Dataset pinning adds two new Prisma models (`EvalDataset`, `EvalDatasetItem`) and a `datasetsRouter`. Prompt fingerprinting is ingest-only: hash the system prompt on every event, store as `promptHash`, and add a `prompt` dimension to `costDrivers.sixDimension`.

**Tech Stack:** Next.js 16.2.4, tRPC v11.16, Prisma 7.7, PostgreSQL 16, Vitest 4.1.4, TypeScript 5 strict

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add score/traceId to Annotation; add EvalDataset + EvalDatasetItem models; add promptHash to LlmEvent |
| `src/server/routers/annotation.ts` | Create | annotation.rate + annotation.get tRPC procedures |
| `src/server/routers/datasets.ts` | Create | datasetsRouter — list, create, addItem, removeItem, items |
| `src/server/routers/_app.ts` | Modify | Register annotation and datasets routers |
| `src/lib/ingest.ts` | Modify | Extract + hash system prompt → promptHash |
| `src/server/routers/costDrivers.ts` | Modify | Add 'prompt' as 8th dimension in sixDimension |
| `src/components/traces/StarRating.tsx` | Create | Reusable 1-5 star rating widget |
| `src/components/views/TracesView.tsx` | Modify | Add star rating + Pin to dataset button in detail panel |
| `src/components/views/DatasetsView.tsx` | Create | List datasets, show pinned traces per dataset |
| `src/app/page.tsx` | Modify | Add 'Datasets' to SECONDARY_NAV |
| `src/__tests__/routers/annotation.test.ts` | Create | annotation router unit tests |
| `src/__tests__/routers/datasets.test.ts` | Create | datasets router unit tests |
| `src/__tests__/lib/ingest.test.ts` | Modify | promptHash extraction tests |

---

### Task 1: Extend Annotation model + schema for EvalDataset, promptHash

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Edit schema.prisma**

Add `score` and `traceId` to the `Annotation` model:

```prisma
model Annotation {
  id       String   @id @default(uuid())
  ts       DateTime
  type     String
  title    String
  detail   String?
  impact   String?
  severity String
  score    Int?               // 1-5 quality rating
  traceId  String?  @map("trace_id")  // soft reference to LlmEvent.id

  @@index([ts(sort: Desc)])
  @@index([traceId])
  @@map("annotations")
}
```

Add new models after `Budget`:

```prisma
model EvalDataset {
  id        String            @id @default(uuid())
  name      String
  createdAt DateTime          @default(now()) @map("created_at")
  items     EvalDatasetItem[]

  @@map("eval_datasets")
}

model EvalDatasetItem {
  id        String      @id @default(uuid())
  datasetId String      @map("dataset_id")
  eventId   String      @map("event_id")
  note      String?
  addedAt   DateTime    @default(now()) @map("added_at")
  dataset   EvalDataset @relation(fields: [datasetId], references: [id], onDelete: Cascade)

  @@unique([datasetId, eventId])
  @@map("eval_dataset_items")
}
```

Add `promptHash` to `LlmEvent` (after `eventHash`):

```prisma
promptHash String? @map("prompt_hash") @db.VarChar(16)

@@index([promptHash])
```

- [ ] **Step 2: Push schema**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npx prisma db push && npx prisma generate
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "chore: extend Annotation (score/traceId), add EvalDataset/EvalDatasetItem, add promptHash to LlmEvent"
```

---

### Task 2: annotation tRPC router

**Files:**
- Create: `src/server/routers/annotation.ts`
- Create: `src/__tests__/routers/annotation.test.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/routers/annotation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { annotationRouter } from '@/server/routers/annotation';

const mockCreate    = vi.fn();
const mockFindFirst = vi.fn();
const mockUpsert    = vi.fn();

const mockDb = {
  annotation: { create: mockCreate, findFirst: mockFindFirst, upsert: mockUpsert },
};
const caller = createCallerFactory(annotationRouter)({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

describe('annotationRouter.rate', () => {
  it('creates an annotation with score and traceId', async () => {
    mockUpsert.mockResolvedValue({
      id: 'ann-1', ts: new Date(), type: 'rating',
      title: 'Quality rating', severity: 'info',
      score: 4, traceId: 'event-abc',
      detail: null, impact: null,
    });

    const result = await caller.rate({ traceId: 'event-abc', score: 4 });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { traceId: 'event-abc' },
        create: expect.objectContaining({ score: 4, traceId: 'event-abc' }),
        update: expect.objectContaining({ score: 4 }),
      })
    );
    expect(result.score).toBe(4);
    expect(result.traceId).toBe('event-abc');
  });

  it('rejects scores outside 1-5 range', async () => {
    await expect(caller.rate({ traceId: 'e1', score: 0 })).rejects.toThrow();
    await expect(caller.rate({ traceId: 'e1', score: 6 })).rejects.toThrow();
  });
});

describe('annotationRouter.get', () => {
  it('returns annotation for a traceId', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'ann-1', ts: new Date(), type: 'rating',
      title: 'Quality rating', severity: 'info',
      score: 3, traceId: 'event-abc',
      detail: 'Good but verbose', impact: null,
    });

    const result = await caller.get({ traceId: 'event-abc' });
    expect(result?.score).toBe(3);
  });

  it('returns null when no annotation exists', async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await caller.get({ traceId: 'missing' });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- annotation --reporter=verbose 2>&1 | tail -10
```

Expected: FAIL — `annotationRouter` module not found.

- [ ] **Step 3: Create `src/server/routers/annotation.ts`**

```typescript
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const annotationRouter = router({
  rate: publicProcedure
    .input(z.object({
      traceId: z.string().min(1),
      score:   z.number().int().min(1).max(5),
      note:    z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.annotation.upsert({
        where:  { traceId: input.traceId } as never, // traceId unique per Annotation
        create: {
          ts:       new Date(),
          type:     'rating',
          title:    'Quality rating',
          severity: 'info',
          score:    input.score,
          traceId:  input.traceId,
          detail:   input.note ?? null,
        },
        update: {
          score:  input.score,
          detail: input.note ?? null,
          ts:     new Date(),
        },
      });
      return {
        id:      result.id,
        score:   result.score,
        traceId: result.traceId,
        note:    result.detail,
      };
    }),

  get: publicProcedure
    .input(z.object({ traceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db.annotation.findFirst({
        where: { traceId: input.traceId, type: 'rating' },
      });
      if (!result) return null;
      return {
        id:      result.id,
        score:   result.score,
        traceId: result.traceId,
        note:    result.detail,
      };
    }),
});
```

Note: The `upsert` uses `traceId` as the unique where key. For Prisma to accept this, add `@@unique([traceId, type])` to the `Annotation` model OR handle the upsert by first querying then create/update. Simplest approach: use `findFirst` + `create` or `update` manually:

```typescript
// Replace the upsert with:
const existing = await ctx.db.annotation.findFirst({
  where: { traceId: input.traceId, type: 'rating' },
});
const result = existing
  ? await ctx.db.annotation.update({
      where:  { id: existing.id },
      data:   { score: input.score, detail: input.note ?? null, ts: new Date() },
    })
  : await ctx.db.annotation.create({
      data: {
        ts:       new Date(),
        type:     'rating',
        title:    'Quality rating',
        severity: 'info',
        score:    input.score,
        traceId:  input.traceId,
        detail:   input.note ?? null,
      },
    });
```

Update the test mock to use `mockFindFirst` + `mockCreate`/`mockUpdate` accordingly.

- [ ] **Step 4: Register router in _app.ts**

In `src/server/routers/_app.ts`, import and register:

```typescript
import { annotationRouter } from './annotation';
// ...
export const appRouter = router({
  // ... existing routers ...
  annotation: annotationRouter,
});
```

- [ ] **Step 5: Run tests**

```bash
npm test -- annotation --reporter=verbose
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/annotation.ts src/server/routers/_app.ts src/__tests__/routers/annotation.test.ts
git commit -m "feat: annotationRouter — rate (1-5) + get by traceId"
```

---

### Task 3: Star rating widget + rating in TracesView detail

**Files:**
- Create: `src/components/traces/StarRating.tsx`
- Modify: `src/components/views/TracesView.tsx`

- [ ] **Step 1: Create `StarRating` component**

Create `src/components/traces/StarRating.tsx`:

```tsx
'use client';

interface Props {
  value: number | null;
  onChange: (score: number) => void;
  disabled?: boolean;
}

export function StarRating({ value, onChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          style={{
            background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
            padding: '2px 1px', fontSize: 14, lineHeight: 1,
            color: (value ?? 0) >= star ? '#C9966B' : 'var(--line-2)',
            transition: 'color 120ms',
          }}
          title={`Rate ${star}`}
        >
          ★
        </button>
      ))}
      {value != null && (
        <span className="mono" style={{ fontSize: 9, color: 'var(--steel)', marginLeft: 3 }}>
          {value}/5
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add rating to the trace detail panel in TracesView**

In `src/components/views/TracesView.tsx`, find the expanded detail section (the area that shows token breakdown, cost, etc.). Add the star rating widget and Pin button:

```tsx
import { StarRating } from '@/components/traces/StarRating';

// Inside the expanded detail row component:
const utils = trpc.useUtils();
const rateMutation = trpc.annotation.rate.useMutation({
  onSuccess: () => utils.annotation.get.invalidate({ traceId: selectedTrace.id }),
});
const { data: annotation } = trpc.annotation.get.useQuery(
  { traceId: selectedTrace.id },
  { enabled: !!selectedTrace }
);

// In the detail JSX:
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
  <span className="label">QUALITY</span>
  <StarRating
    value={annotation?.score ?? null}
    onChange={score => rateMutation.mutate({ traceId: selectedTrace.id, score })}
    disabled={rateMutation.isPending}
  />
</div>
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
# Navigate to Traces → expand a row → star rating appears in detail panel
# Click a star — it persists on re-expand
```

- [ ] **Step 4: Commit**

```bash
git add src/components/traces/StarRating.tsx src/components/views/TracesView.tsx
git commit -m "feat: star rating widget in TracesView detail panel"
```

---

### Task 4: datasets tRPC router

**Files:**
- Create: `src/server/routers/datasets.ts`
- Create: `src/__tests__/routers/datasets.test.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/routers/datasets.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { datasetsRouter } from '@/server/routers/datasets';

const mockCreate    = vi.fn();
const mockFindMany  = vi.fn();
const mockDelete    = vi.fn();
const mockFindUnique = vi.fn();

const mockDb = {
  evalDataset:     { create: mockCreate, findMany: mockFindMany, findUnique: mockFindUnique },
  evalDatasetItem: { create: mockCreate, findMany: mockFindMany, delete: mockDelete },
};
const caller = createCallerFactory(datasetsRouter)({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

const DATASET = { id: 'ds-1', name: 'Error cases', createdAt: new Date('2026-04-27T00:00:00Z'), items: [] };

describe('datasetsRouter.list', () => {
  it('returns all datasets', async () => {
    mockFindMany.mockResolvedValue([DATASET]);
    const result = await caller.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Error cases');
    expect(result[0].createdAt).toBe('2026-04-27T00:00:00.000Z');
  });
});

describe('datasetsRouter.create', () => {
  it('creates a dataset with the given name', async () => {
    mockCreate.mockResolvedValue({ ...DATASET, id: 'ds-new' });
    const result = await caller.create({ name: 'New set' });
    expect(result.id).toBe('ds-new');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'New set' }) })
    );
  });
});

describe('datasetsRouter.addItem', () => {
  it('adds an event to a dataset', async () => {
    mockCreate.mockResolvedValue({ id: 'item-1', datasetId: 'ds-1', eventId: 'event-x', note: null, addedAt: new Date() });
    const result = await caller.addItem({ datasetId: 'ds-1', eventId: 'event-x' });
    expect(result.datasetId).toBe('ds-1');
    expect(result.eventId).toBe('event-x');
  });
});

describe('datasetsRouter.removeItem', () => {
  it('removes an item by id', async () => {
    mockDelete.mockResolvedValue({ id: 'item-1' });
    await caller.removeItem({ id: 'item-1' });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });
});

describe('datasetsRouter.items', () => {
  it('returns items for a dataset', async () => {
    mockFindUnique.mockResolvedValue({
      ...DATASET,
      items: [{ id: 'item-1', eventId: 'event-x', note: 'bad output', addedAt: new Date() }],
    });
    const result = await caller.items({ datasetId: 'ds-1' });
    expect(result).toHaveLength(1);
    expect(result[0].eventId).toBe('event-x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- datasets --reporter=verbose 2>&1 | tail -10
```

Expected: FAIL — `datasetsRouter` not found.

- [ ] **Step 3: Create `src/server/routers/datasets.ts`**

```typescript
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const datasetsRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.evalDataset.findMany({
        orderBy: { createdAt: 'desc' },
        include: { items: { select: { id: true } } },
      });
      return rows.map(r => ({
        id:        r.id,
        name:      r.name,
        itemCount: r.items.length,
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.evalDataset.create({ data: { name: input.name } });
      return { id: row.id, name: row.name, itemCount: 0, createdAt: row.createdAt.toISOString() };
    }),

  addItem: publicProcedure
    .input(z.object({
      datasetId: z.string().min(1),
      eventId:   z.string().min(1),
      note:      z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.evalDatasetItem.create({
        data: {
          datasetId: input.datasetId,
          eventId:   input.eventId,
          note:      input.note ?? null,
        },
      });
      return {
        id:        row.id,
        datasetId: row.datasetId,
        eventId:   row.eventId,
        note:      row.note,
        addedAt:   row.addedAt.toISOString(),
      };
    }),

  removeItem: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.evalDatasetItem.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  items: publicProcedure
    .input(z.object({ datasetId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.evalDataset.findUnique({
        where:   { id: input.datasetId },
        include: { items: { orderBy: { addedAt: 'desc' } } },
      });
      if (!row) return [];
      return row.items.map(item => ({
        id:        item.id,
        eventId:   item.eventId,
        note:      item.note,
        addedAt:   item.addedAt.toISOString(),
      }));
    }),
});
```

- [ ] **Step 4: Register in _app.ts**

```typescript
import { datasetsRouter } from './datasets';
// ...
datasets: datasetsRouter,
```

- [ ] **Step 5: Run tests**

```bash
npm test -- datasets --reporter=verbose
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/datasets.ts src/server/routers/_app.ts src/__tests__/routers/datasets.test.ts
git commit -m "feat: datasetsRouter — CRUD for EvalDataset and EvalDatasetItem"
```

---

### Task 5: Pin to Dataset button in TracesView

**Files:**
- Modify: `src/components/views/TracesView.tsx`

- [ ] **Step 1: Add Pin button and dataset picker to trace detail panel**

In the expanded detail section of `TracesView`, after the star rating widget:

```tsx
const utils = trpc.useUtils();
const { data: datasets }    = trpc.datasets.list.useQuery();
const addItemMutation        = trpc.datasets.addItem.useMutation({
  onSuccess: () => {
    setPinPopoverOpen(false);
    setPinSuccess(true);
    setTimeout(() => setPinSuccess(false), 2000);
  },
});

const [pinPopoverOpen, setPinPopoverOpen] = useState(false);
const [pinSuccess, setPinSuccess]         = useState(false);

// In the detail JSX:
<div style={{ position: 'relative' }}>
  <button
    className="btn-secondary"
    style={{ fontSize: 10, padding: '4px 10px' }}
    onClick={() => setPinPopoverOpen(o => !o)}
  >
    {pinSuccess ? '✓ Pinned' : '↑ Pin to dataset'}
  </button>

  {pinPopoverOpen && (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 100,
      background: 'var(--bg-2)', border: '1px solid var(--line-2)',
      borderRadius: 6, padding: 8, minWidth: 200,
      boxShadow: '0 4px 16px rgba(0,0,0,.4)',
    }}>
      <div className="label" style={{ marginBottom: 6 }}>SELECT DATASET</div>
      {(datasets ?? []).map(ds => (
        <button
          key={ds.id}
          className="btn-secondary"
          style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, fontSize: 11 }}
          onClick={() => addItemMutation.mutate({ datasetId: ds.id, eventId: selectedTrace.id })}
        >
          {ds.name} <span style={{ color: 'var(--steel)' }}>({ds.itemCount})</span>
        </button>
      ))}
      {(datasets ?? []).length === 0 && (
        <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
          No datasets yet — create one in Datasets view
        </span>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 2: Verify in browser**

```bash
npm run dev
# Traces → expand a row → "↑ Pin to dataset" button appears
# If no datasets, the popover shows "No datasets yet"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/views/TracesView.tsx
git commit -m "feat: Pin to dataset button in TracesView detail panel"
```

---

### Task 6: DatasetsView + nav entry

**Files:**
- Create: `src/components/views/DatasetsView.tsx`
- Modify: `src/app/page.tsx` (add 'Datasets' to SECONDARY_NAV)

- [ ] **Step 1: Create DatasetsView**

Create `src/components/views/DatasetsView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { ViewStatusBar } from '@/components/shared/ViewStatusBar';

interface Props { onNavigate?: (view: string) => void }

export function DatasetsView({ onNavigate }: Props) {
  const utils = trpc.useUtils();
  const { data: datasets, isLoading } = trpc.datasets.list.useQuery();
  const createMutation = trpc.datasets.create.useMutation({
    onSuccess: () => {
      setNewName('');
      setShowCreate(false);
      utils.datasets.list.invalidate();
    },
  });
  const removeItemMutation = trpc.datasets.removeItem.useMutation({
    onSuccess: () => utils.datasets.items.invalidate(),
  });

  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [newName, setNewName]         = useState('');
  const [showCreate, setShowCreate]   = useState(false);

  const { data: items } = trpc.datasets.items.useQuery(
    { datasetId: selectedId! },
    { enabled: !!selectedId }
  );

  return (
    <>
      <ViewStatusBar />
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, marginTop: 16 }}>

        {/* Dataset list */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label">DATASETS</span>
            <button className="btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setShowCreate(c => !c)}>
              + NEW
            </button>
          </div>

          {showCreate && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-2)' }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Dataset name"
                onKeyDown={e => e.key === 'Enter' && newName && createMutation.mutate({ name: newName })}
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--bg-1)', border: '1px solid var(--line-2)',
                  borderRadius: 4, padding: '5px 8px',
                  color: 'var(--mist)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                }}
              />
              <div className="mono" style={{ fontSize: 9, color: 'var(--steel)', marginTop: 4 }}>
                Press Enter to create
              </div>
            </div>
          )}

          {isLoading && (
            <div style={{ padding: '12px 14px' }}>
              <span className="label">Loading…</span>
            </div>
          )}

          {(datasets ?? []).map(ds => (
            <button
              key={ds.id}
              onClick={() => setSelectedId(ds.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px', background: selectedId === ds.id ? 'rgba(111,168,179,.08)' : 'none',
                border: 'none', borderBottom: '1px solid var(--line-2)', cursor: 'pointer',
                borderLeft: selectedId === ds.id ? '2px solid var(--accent-2)' : '2px solid transparent',
              }}
            >
              <div className="mono" style={{ fontSize: 12, color: 'var(--mist)' }}>{ds.name}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--steel)', marginTop: 2 }}>
                {ds.itemCount} {ds.itemCount === 1 ? 'trace' : 'traces'}
              </div>
            </button>
          ))}

          {!isLoading && (datasets ?? []).length === 0 && (
            <div style={{ padding: '16px 14px' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>
                No datasets yet.{' '}
                <span style={{ color: 'var(--graphite)' }}>Pin traces from the Traces view.</span>
              </span>
            </div>
          )}
        </div>

        {/* Dataset items */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          {!selectedId ? (
            <div style={{ padding: '24px 20px' }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--steel)' }}>
                Select a dataset to view pinned traces.
              </span>
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line-2)' }}>
                <span className="label">
                  {datasets?.find(d => d.id === selectedId)?.name ?? 'Dataset'} — PINNED TRACES
                </span>
              </div>
              {(items ?? []).map(item => (
                <div
                  key={item.id}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--line-2)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--fog)' }}>
                      event:{item.eventId.slice(0, 12)}…
                    </div>
                    {item.note && (
                      <div className="mono" style={{ fontSize: 10, color: 'var(--steel)', marginTop: 2 }}>
                        {item.note}
                      </div>
                    )}
                    <div className="mono" style={{ fontSize: 9, color: 'var(--graphite)', marginTop: 2 }}>
                      {new Date(item.addedAt).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px' }}
                      onClick={() => onNavigate?.('Traces')}
                    >
                      VIEW
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px', color: 'var(--bad)' }}
                      onClick={() => removeItemMutation.mutate({ id: item.id })}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              ))}
              {(items ?? []).length === 0 && (
                <div style={{ padding: '16px 14px' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--steel)' }}>
                    No pinned traces in this dataset.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add 'Datasets' to SECONDARY_NAV in page.tsx**

In `src/app/page.tsx`, find the `SECONDARY_NAV` array:

```typescript
// Change:
const SECONDARY_NAV = ['Rules', 'Archive'];
// To:
const SECONDARY_NAV = ['Rules', 'Archive', 'Datasets'];
```

Add the DatasetsView case in the view-rendering switch/conditional:

```tsx
{activeView === 'Datasets' && <DatasetsView onNavigate={setActiveView} />}
```

Import:

```tsx
import { DatasetsView } from '@/components/views/DatasetsView';
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
# Sidebar should show "Datasets" under secondary nav
# Navigate to Datasets — "No datasets yet" state renders
# Create a dataset, pin a trace from Traces view, verify it appears
```

- [ ] **Step 4: Commit**

```bash
git add src/components/views/DatasetsView.tsx src/app/page.tsx
git commit -m "feat: DatasetsView with create, list, and item management; add to secondary nav"
```

---

### Task 7: Prompt fingerprinting — ingest + costDrivers

**Files:**
- Modify: `src/lib/ingest.ts`
- Modify: `src/server/routers/costDrivers.ts`
- Modify: `src/__tests__/lib/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/lib/ingest.test.ts`:

```typescript
describe('parseIngestPayload — promptHash', () => {
  it('computes a 12-char hex hash of the system prompt', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user',   content: 'Hello' },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.promptHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('returns undefined promptHash when no messages present', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.promptHash).toBeUndefined();
  });

  it('returns same hash for the same system prompt', () => {
    const payload = {
      model: 'claude-sonnet-4-6', custom_llm_provider: 'anthropic',
      messages: [{ role: 'system', content: 'My system prompt.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const r1 = parseIngestPayload(payload);
    const r2 = parseIngestPayload(payload);
    expect(r1?.promptHash).toBe(r2?.promptHash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- ingest --reporter=verbose 2>&1 | grep -E "(promptHash|FAIL)"
```

Expected: FAIL — `promptHash` not on `NormalizedEvent`.

- [ ] **Step 3: Update NormalizedEvent and parseIngestPayload**

In `src/lib/ingest.ts`, add `promptHash` to the interface:

```typescript
export interface NormalizedEvent {
  // ... existing fields ...
  promptHash?: string;
}
```

The file already imports `createHash` from `'crypto'`. Use it to hash the system prompt. Add after the `sessionId` extraction in `parseIngestPayload`:

```typescript
// Prompt fingerprinting — hash the system prompt (first system message)
const systemMsg = body.messages?.find((m: { role: string }) => m.role === 'system');
const promptHash: string | undefined = systemMsg?.content
  ? createHash('sha256').update(String(systemMsg.content)).digest('hex').slice(0, 12)
  : undefined;
```

Add `promptHash` to the return object.

- [ ] **Step 4: Run tests**

```bash
npm test -- ingest --reporter=verbose
```

Expected: all promptHash tests PASS.

- [ ] **Step 5: Add prompt dimension to costDrivers.sixDimension**

In `src/server/routers/costDrivers.ts`, add an 8th query to the `Promise.all`:

```typescript
ctx.db.$queryRaw<DetailRow[]>`
  SELECT "promptHash" AS label, SUM("costUsd")::float AS cost,
    COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
    AVG("latencyMs")::float AS avg_lat_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
  FROM llm_events WHERE ts >= ${since} AND "promptHash" IS NOT NULL ${pfSql}
  GROUP BY "promptHash" ORDER BY cost DESC LIMIT 8`,
```

Destructure as `byPrompt` and add to return:

```typescript
const [byProvider, byModel, bySurface, byProject, byContentType, byRegion, byUser, byPrompt] = await Promise.all([...]);
// ...
return {
  provider:    mapDim(byProvider),
  model:       mapDim(byModel),
  surface:     mapDim(bySurface),
  project:     mapDim(byProject),
  contentType: mapDim(byContentType),
  region:      mapDim(byRegion),
  user:        mapDim(byUser),
  prompt:      mapDim(byPrompt),
};
```

- [ ] **Step 6: Add Prompt tab to CostDriversView**

In `src/components/views/CostDriversView.tsx`, add to the DIMS array:

```typescript
{ key: 'prompt' as const, label: 'Prompt' },
```

The prompt labels are 12-char hex hashes. Display as `sha:` prefix:

Prompt hash labels come from the `label` field in `mapDim`. They'll render as hex strings like `abc123def456`. The UI label column in `CostDriversView` will display them as-is; users can recognize which hash corresponds to a prompt change by comparing timestamps.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingest.ts src/server/routers/costDrivers.ts src/components/views/CostDriversView.tsx src/__tests__/lib/ingest.test.ts
git commit -m "feat: prompt fingerprinting — SHA-256 hash of system prompt, Prompt tab in CostDrivers"
```

---

### Task 8: Final checks + PR

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Create Phase 3 PR**

```bash
git push origin HEAD
gh pr create \
  --title "feat: Phase 3 — quality layer (star ratings, dataset pinning, prompt fingerprinting) (#17)" \
  --body "Implements Observatory enhancement roadmap Phase 3.

- Annotation model extended with score + traceId for quality ratings
- annotationRouter — rate (1-5 stars) + get by traceId; upsert semantics
- StarRating component — 5-star widget in TracesView detail panel
- EvalDataset + EvalDatasetItem models with datasetsRouter (list/create/addItem/removeItem/items)
- Pin to Dataset button in TracesView detail popover  
- DatasetsView — create and browse datasets, view + remove pinned traces
- Datasets added to SECONDARY_NAV
- Prompt fingerprinting — SHA-256(first 12 hex) of system prompt on every LlmEvent
- Prompt dimension in costDrivers.sixDimension + CostDriversView Prompt tab

Spec: docs/superpowers/specs/2026-04-27-observatory-enhancement-roadmap-design.md"
```
