# Observatory — Iteration 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five targeted improvements to the Observatory dashboard: live ingest age, global provider filter propagation, Add Service refresh, LiveBar hydration fix, and server-persisted alert rules.

**Architecture:** All tRPC changes follow the existing pattern in `src/server/routers/` — `publicProcedure` with Zod input, Prisma/`$queryRaw` queries, registered in `src/server/routers/_app.ts`. Frontend components use `trpc.<router>.<procedure>.useQuery()` from `@trpc/react-query` v11 + TanStack Query v5. Tests use `createCallerFactory` from `@/server/trpc` and mock `db` with `vi.fn()`.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, TanStack Query v5, Prisma 7, PostgreSQL, Vitest

---

## Phase 1: Real-time ingest indicator

### Task 1: Add `pulse.lastIngest` tRPC procedure

**Files:**
- Modify: `src/server/routers/pulse.ts` (add procedure after `pulseChart`)
- Create: `src/__tests__/routers/pulse-ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/routers/pulse-ingest.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { pulseRouter } from '@/server/routers/pulse';

const mockDb = {
  $queryRaw: vi.fn().mockResolvedValue([{ last_ts: new Date('2026-04-21T12:00:00Z') }]),
  llmEvent: {
    aggregate: vi.fn().mockResolvedValue({ _sum: {}, _count: { id: 0 }, _avg: {} }),
    findMany:  vi.fn().mockResolvedValue([]),
    count:     vi.fn().mockResolvedValue(0),
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCallerFactory(pulseRouter)({ db: mockDb as any });

describe('pulseRouter.lastIngest', () => {
  it('returns lastTs as ISO string when events exist', async () => {
    const result = await caller.lastIngest();
    expect(result.lastTs).toBe('2026-04-21T12:00:00.000Z');
  });

  it('returns null lastTs when table is empty', async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([{ last_ts: null }]);
    const result = await caller.lastIngest();
    expect(result.lastTs).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npx vitest run src/__tests__/routers/pulse-ingest.test.ts
```

Expected: FAIL — `caller.lastIngest is not a function`

- [ ] **Step 3: Add `lastIngest` procedure to pulse router**

Open `src/server/routers/pulse.ts`. After the closing `}),` of `pulseChart`, add before the closing `});` of the router:

```ts
  lastIngest: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.$queryRaw<Array<{ last_ts: Date | null }>>`
        SELECT MAX(ts) AS last_ts FROM llm_events
      `;
      const raw = rows[0]?.last_ts ?? null;
      return { lastTs: raw ? raw.toISOString() : null };
    }),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/routers/pulse-ingest.test.ts
```

Expected: 2/2 PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/pulse.ts src/__tests__/routers/pulse-ingest.test.ts
git commit -m "feat: add pulse.lastIngest tRPC procedure"
```

---

### Task 2: Wire `lastIngest` into the footer

**Files:**
- Modify: `src/app/page.tsx` (replace hardcoded footer string)

- [ ] **Step 1: Replace the hardcoded footer span in `src/app/page.tsx`**

Find line 176 (the footer section):
```tsx
<span className="mono" style={{ color: 'var(--steel)' }}>retention: 90d · last ingest: 00:00:03 ago</span>
```

Replace with:
```tsx
<IngestAge />
```

- [ ] **Step 2: Add the `IngestAge` component above the `App` function in `src/app/page.tsx`**

Add this before the `export default function App()` line:

```tsx
function fmtAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000)  return `${Math.round(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`;
  return `${Math.round(diffMs / 3_600_000)}h ago`;
}

function IngestAge() {
  const { data } = trpc.pulse.lastIngest.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const label = data?.lastTs ? fmtAgo(data.lastTs) : '—';
  return (
    <span className="mono" style={{ color: 'var(--steel)' }}>
      retention: 90d · last ingest: {label}
    </span>
  );
}
```

- [ ] **Step 3: Verify `trpc` is already imported at the top of `src/app/page.tsx`**

The file uses tRPC elsewhere. If `trpc` is not imported, add:
```tsx
import { trpc } from '@/lib/trpc-client';
```

Check: `grep "trpc-client" src/app/page.tsx`. If nothing, add the import.

- [ ] **Step 4: Verify build is clean**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: live ingest age in footer (5s poll)"
```

---

## Phase 2: Provider filter propagation

> Decision: `WhyInsightsCard`, `ZombieSessionsCard`, and `EntityExplorer` will respect the global provider filter. `HowCard` stays global (it shows the latest trace, which is meaningful across all providers). `WhenCard` already accepts `provider`.

### Task 3: Add provider filter to insights router

**Files:**
- Modify: `src/server/routers/insights.ts`
- Modify: `src/__tests__/routers/insights.test.ts`

- [ ] **Step 1: Write failing tests for provider-filtered insights**

Add to `src/__tests__/routers/insights.test.ts` at the bottom:

```ts
describe('insightsRouter.whyInsights — provider filter', () => {
  it('accepts optional provider without throwing', async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ hit_ratio: 85 }])
      .mockResolvedValueOnce([{ hit_ratio: 90 }])
      .mockResolvedValueOnce([]);

    await expect(caller.whyInsights({ provider: 'anthropic' })).resolves.not.toThrow();
  });
});

describe('insightsRouter.zombieSessions — provider filter', () => {
  it('accepts optional provider without throwing', async () => {
    mockDb.$queryRaw.mockResolvedValue([ZOMBIE_ROW]);
    await expect(caller.zombieSessions({ provider: 'anthropic' })).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/__tests__/routers/insights.test.ts
```

Expected: the two new tests FAIL (procedures don't accept provider yet)

- [ ] **Step 3: Add provider input to insights router**

Replace the entire `src/server/routers/insights.ts` with:

```ts
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';

const providerInput = z.object({ provider: z.string().optional() }).optional();

export const insightsRouter = router({
  whyInsights: publicProcedure
    .input(providerInput)
    .query(async ({ ctx, input }) => {
      const since7d = new Date(Date.now() - 7 * 86_400_000);
      const since1d = new Date(Date.now() - 86_400_000);
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const [cacheToday, cache7d] = await Promise.all([
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG("cachedTokens"::float / NULLIF("inputTokens" + "cachedTokens", 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since1d} ${pfSql}
        `,
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT AVG("cachedTokens"::float / NULLIF("inputTokens" + "cachedTokens", 0)) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since7d} AND ts < ${since1d} ${pfSql}
        `,
      ]);

      const todayHit = Number(cacheToday[0]?.hit_ratio ?? 0);
      const weekHit  = Number(cache7d[0]?.hit_ratio ?? 0);
      const cacheDecay = weekHit > 0 && todayHit < weekHit * 0.6;

      const routingRows = await ctx.db.$queryRaw<Array<{ project: string; avg_quality: unknown; cost: unknown }>>`
        SELECT project, AVG("qualityScore")::float AS avg_quality, SUM("costUsd")::float AS cost
        FROM llm_events
        WHERE ts >= ${since7d} AND model LIKE '%opus%' ${pfSql}
        GROUP BY project
        HAVING AVG("qualityScore") < 92
        ORDER BY cost DESC
        LIMIT 3
      `;

      const insights = [];
      if (cacheDecay) {
        insights.push({
          id: 'cache-decay',
          severity: 'warn',
          title: 'Cache hit rate dropped',
          detail: `Today ${todayHit.toFixed(1)}% vs 7d avg ${weekHit.toFixed(1)}%`,
          recommendation: 'Review cache-busting changes or session reset patterns.',
        });
      }
      for (const row of routingRows) {
        insights.push({
          id: `routing-${row.project}`,
          severity: 'info',
          title: `Routing opportunity: ${row.project}`,
          detail: `Opus avg quality ${Number(row.avg_quality).toFixed(1)} - Sonnet may suffice`,
          recommendation: `Switch ${row.project} to Sonnet. Est. saving: ~60%.`,
        });
      }
      return insights;
    }),

  zombieSessions: publicProcedure
    .input(providerInput)
    .query(async ({ ctx, input }) => {
      const since24h = new Date(Date.now() - 24 * 3_600_000);
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const rows = await ctx.db.$queryRaw<Array<{
        session_id: string; project: string; surface: string;
        steps: bigint; cost: unknown; last_ts: Date;
        first_input: bigint; last_input: bigint;
      }>>`
        SELECT
          "sessionId" AS session_id,
          project,
          surface,
          COUNT(*) AS steps,
          SUM("costUsd")::float AS cost,
          MAX(ts) AS last_ts,
          (ARRAY_AGG("inputTokens" ORDER BY ts ASC))[1] AS first_input,
          (ARRAY_AGG("inputTokens" ORDER BY ts DESC))[1] AS last_input
        FROM llm_events
        WHERE ts >= ${since24h} AND "sessionId" IS NOT NULL ${pfSql}
        GROUP BY "sessionId", project, surface
        HAVING COUNT(*) >= 2
        ORDER BY cost DESC
        LIMIT 20
      `;
      const now = Date.now();
      return rows.map(r => {
        const ageMs = now - r.last_ts.getTime();
        const steps = Number(r.steps);
        const bloatRatio = Number(r.first_input) > 0 ? Number(r.last_input) / Number(r.first_input) : 1;
        let type = 'active';
        if (steps > 8 && ageMs > 3 * 60_000) type = 'loop';
        else if (bloatRatio > 1.5) type = 'bloat';
        else if (ageMs > 5 * 60_000) type = 'abandoned';
        else if (Number(r.cost) > 5 && r.surface === 'automation') type = 'runaway';
        return {
          sessionId: r.session_id,
          project: r.project,
          surface: r.surface,
          steps,
          costUsd: Number(r.cost),
          lastTs: r.last_ts.toISOString(),
          ageMs,
          type,
          bloatRatio: Math.round(bloatRatio * 100) / 100,
        };
      }).filter(r => r.type !== 'active');
    }),
});
```

- [ ] **Step 4: Run all insights tests**

```bash
npx vitest run src/__tests__/routers/insights.test.ts
```

Expected: all tests PASS (new + existing)

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/insights.ts src/__tests__/routers/insights.test.ts
git commit -m "feat: add optional provider filter to whyInsights + zombieSessions"
```

---

### Task 4: Wire provider filter into WhyInsightsCard and ZombieSessionsCard

**Files:**
- Modify: `src/components/why/WhyInsightsCard.tsx`
- Modify: `src/components/why/ZombieSessionsCard.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update WhyInsightsCard to accept and pass provider**

In `src/components/why/WhyInsightsCard.tsx`, change the function signature from:

```tsx
export function WhyInsightsCard() {
```

to:

```tsx
interface Props { provider?: string }
export function WhyInsightsCard({ provider }: Props = {}) {
```

Then find the `trpc.insights.whyInsights.useQuery()` call and change it to:

```tsx
const { data: insights = [] } = trpc.insights.whyInsights.useQuery(
  provider ? { provider } : undefined
);
```

(Find the exact existing call with `grep -n "whyInsights" src/components/why/WhyInsightsCard.tsx` to confirm the current line.)

- [ ] **Step 2: Update ZombieSessionsCard to accept and pass provider**

In `src/components/why/ZombieSessionsCard.tsx`, change the function signature from:

```tsx
export function ZombieSessionsCard() {
```

to:

```tsx
interface Props { provider?: string }
export function ZombieSessionsCard({ provider }: Props = {}) {
```

Then find the `trpc.insights.zombieSessions.useQuery()` call and change it to:

```tsx
const { data: sessions = [] } = trpc.insights.zombieSessions.useQuery(
  provider ? { provider } : undefined
);
```

(Find the exact existing call with `grep -n "zombieSessions" src/components/why/ZombieSessionsCard.tsx`.)

- [ ] **Step 3: Pass providerFilter from page.tsx to both cards**

In `src/app/page.tsx`, find:

```tsx
<WhyInsightsCard />
<ZombieSessionsCard />
```

Replace with:

```tsx
<WhyInsightsCard provider={providerFilter ?? undefined} />
<ZombieSessionsCard provider={providerFilter ?? undefined} />
```

- [ ] **Step 4: Verify build is clean**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all 139+ tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/why/WhyInsightsCard.tsx src/components/why/ZombieSessionsCard.tsx src/app/page.tsx
git commit -m "feat: wire providerFilter into WhyInsightsCard + ZombieSessionsCard"
```

---

## Phase 3: Add Service register flow

### Task 5: Fix ServicesRail invalidation + add badge count

**Files:**
- Modify: `src/components/pulse/ServicesRail.tsx`

The current `onSaved` handler only calls `refetch()` on `providerBreakdown`. The `services.list` query is not invalidated, so the new service card doesn't appear until the user navigates away. Fix: use `trpc.useUtils()` to invalidate both queries. Also add a registered-service count badge to the "+" tile.

- [ ] **Step 1: Update ServicesRail to use `useUtils()` for invalidation**

In `src/components/pulse/ServicesRail.tsx`, find the top of the component:

```tsx
export function ServicesRail({ lookback, providerFilter, onSelect }: ServicesRailProps) {
  const [showModal, setShowModal] = useState(false);
  const { data: liveData, refetch } = trpc.who.providerBreakdown.useQuery({ lookback });
  const { data: registered }        = trpc.services.list.useQuery();
```

Replace with:

```tsx
export function ServicesRail({ lookback, providerFilter, onSelect }: ServicesRailProps) {
  const [showModal, setShowModal] = useState(false);
  const utils = trpc.useUtils();
  const { data: liveData } = trpc.who.providerBreakdown.useQuery({ lookback });
  const { data: registered } = trpc.services.list.useQuery();
```

Then find the `onSaved` callback:

```tsx
onSaved={() => { refetch(); }}
```

Replace with:

```tsx
onSaved={() => {
  utils.who.providerBreakdown.invalidate();
  utils.services.list.invalidate();
}}
```

- [ ] **Step 2: Add badge count to the "+" tile**

In `src/components/pulse/ServicesRail.tsx`, find the "Add service" card's inner content:

```tsx
        <div style={{
          width: 22, height: 22, borderRadius: 4, background: '#4A5358',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 600, color: 'var(--mist)', flexShrink: 0,
        }}>
          +
        </div>
        <span className="label" style={{ color: 'var(--graphite)', fontSize: 9 }}>Add service</span>
```

Replace with:

```tsx
        <div style={{
          width: 22, height: 22, borderRadius: 4, background: '#4A5358',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 600, color: 'var(--mist)', flexShrink: 0,
        }}>
          +
        </div>
        <span className="label" style={{ color: 'var(--graphite)', fontSize: 9 }}>Add service</span>
        {(registered ?? []).length > 0 && (
          <span className="mono" style={{ fontSize: 9, color: 'var(--steel)' }}>
            {(registered ?? []).length} registered
          </span>
        )}
```

- [ ] **Step 3: Verify build is clean**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/components/pulse/ServicesRail.tsx
git commit -m "fix: invalidate services.list + providerBreakdown on Add Service save; add badge count"
```

---

## Phase 4: LiveBar hydration fix

### Task 6: Move `Math.random()` initialization to useEffect in LiveBar

**Files:**
- Modify: `src/components/layout/CommandHeader.tsx`

React hydration warnings fire because `Math.random()` produces different values on the server (SSR) and client. The fix: initialize heights with a stable value (all 4s) and update to random values only after mount via `useEffect`.

- [ ] **Step 1: Update `LiveBar` in `src/components/layout/CommandHeader.tsx`**

Find the existing `LiveBar` function:

```tsx
function LiveBar() {
  const [heights, setHeights] = useState<number[]>(
    () => Array.from({ length: 14 }, () => 4 + Math.random() * 14)
  );

  useEffect(() => {
    const id = setInterval(() => {
      setHeights(Array.from({ length: 14 }, () => 4 + Math.random() * 14));
    }, 240);
    return () => clearInterval(id);
  }, []);
```

Replace with:

```tsx
function LiveBar() {
  const [heights, setHeights] = useState<number[]>(
    () => Array.from({ length: 14 }, () => 4)
  );

  useEffect(() => {
    // First frame: set random heights (client-only, avoids SSR mismatch)
    setHeights(Array.from({ length: 14 }, () => 4 + Math.random() * 14));
    const id = setInterval(() => {
      setHeights(Array.from({ length: 14 }, () => 4 + Math.random() * 14));
    }, 240);
    return () => clearInterval(id);
  }, []);
```

- [ ] **Step 2: Verify build is clean**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/CommandHeader.tsx
git commit -m "fix: eliminate LiveBar SSR hydration mismatch by deferring Math.random() to useEffect"
```

---

## Phase 5: RulesView server persistence

### Task 7: Add AlertRule Prisma model and migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `AlertRule` model to `prisma/schema.prisma`**

At the end of `prisma/schema.prisma`, add:

```prisma
model AlertRule {
  id        String   @id @default(uuid())
  name      String
  metric    String
  lookback  String
  operator  String
  threshold Decimal  @db.Decimal(12, 4)
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())

  @@map("alert_rules")
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npx prisma migrate dev --name add_alert_rules
```

Expected output ends with: `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AlertRule model to Prisma schema"
```

---

### Task 8: Create the rules tRPC router

**Files:**
- Create: `src/server/routers/rules.ts`
- Create: `src/__tests__/routers/rules.test.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/routers/rules.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { rulesRouter } from '@/server/routers/rules';

const mockFindMany = vi.fn();
const mockCreate   = vi.fn();
const mockUpdate   = vi.fn();
const mockDelete   = vi.fn();
const mockFindUnique = vi.fn();

const mockDb = {
  alertRule: { findMany: mockFindMany, create: mockCreate, update: mockUpdate, delete: mockDelete, findUnique: mockFindUnique },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const caller = createCallerFactory(rulesRouter)({ db: mockDb as any });

const RULE = {
  id: 'r1',
  name: 'Cost spike',
  metric: 'cost',
  lookback: '24H',
  operator: 'gt',
  threshold: '5.00',
  enabled: true,
  createdAt: new Date('2026-04-21T00:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('rulesRouter.list', () => {
  it('returns rules ordered by createdAt desc', async () => {
    mockFindMany.mockResolvedValue([RULE]);
    const result = await caller.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
    expect(typeof result[0].threshold).toBe('number');
    expect(result[0].createdAt).toBe('2026-04-21T00:00:00.000Z');
  });
});

describe('rulesRouter.upsert', () => {
  it('creates a new rule and returns it', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...RULE, id: 'r-new', threshold: '10.00' });
    const result = await caller.upsert({
      id: undefined, name: 'New rule', metric: 'cost',
      lookback: '24H', operator: 'gt', threshold: 10, enabled: true,
    });
    expect(result.id).toBe('r-new');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates an existing rule when id is provided', async () => {
    mockFindUnique.mockResolvedValue(RULE);
    mockUpdate.mockResolvedValue({ ...RULE, name: 'Updated' });
    const result = await caller.upsert({
      id: 'r1', name: 'Updated', metric: 'cost',
      lookback: '24H', operator: 'gt', threshold: 5, enabled: true,
    });
    expect(result.id).toBe('r1');
    expect(mockUpdate).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('rulesRouter.remove', () => {
  it('calls db.alertRule.delete with the given id', async () => {
    mockDelete.mockResolvedValue(RULE);
    await caller.remove({ id: 'r1' });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/__tests__/routers/rules.test.ts
```

Expected: FAIL — `Cannot find module '@/server/routers/rules'`

- [ ] **Step 3: Create `src/server/routers/rules.ts`**

```ts
// src/server/routers/rules.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

const ruleShape = z.object({
  id:        z.string().optional(),
  name:      z.string().min(1),
  metric:    z.enum(['cost', 'latency', 'error_rate', 'calls']),
  lookback:  z.enum(['1H', '24H', '30D']),
  operator:  z.enum(['gt', 'lt']),
  threshold: z.number(),
  enabled:   z.boolean(),
});

function normalize(r: {
  id: string; name: string; metric: string; lookback: string;
  operator: string; threshold: unknown; enabled: boolean; createdAt: Date;
}) {
  return {
    id:        r.id,
    name:      r.name,
    metric:    r.metric,
    lookback:  r.lookback,
    operator:  r.operator,
    threshold: Number(r.threshold),
    enabled:   r.enabled,
    createdAt: r.createdAt.toISOString(),
  };
}

export const rulesRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.alertRule.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(normalize);
    }),

  upsert: publicProcedure
    .input(ruleShape)
    .mutation(async ({ ctx, input }) => {
      const existing = input.id
        ? await ctx.db.alertRule.findUnique({ where: { id: input.id } })
        : null;

      const data = {
        name:      input.name,
        metric:    input.metric,
        lookback:  input.lookback,
        operator:  input.operator,
        threshold: input.threshold,
        enabled:   input.enabled,
      };

      const row = existing
        ? await ctx.db.alertRule.update({ where: { id: input.id! }, data })
        : await ctx.db.alertRule.create({ data });

      return normalize(row);
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.alertRule.delete({ where: { id: input.id } });
    }),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/routers/rules.test.ts
```

Expected: 5/5 PASS

- [ ] **Step 5: Register in `src/server/routers/_app.ts`**

Add import after the last import line:
```ts
import { rulesRouter } from './rules';
```

Add to `appRouter`:
```ts
  rules:        rulesRouter,
```

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/rules.ts src/__tests__/routers/rules.test.ts src/server/routers/_app.ts
git commit -m "feat: rules tRPC router with list/upsert/remove"
```

---

### Task 9: Update RulesView to use tRPC

**Files:**
- Modify: `src/components/views/RulesView.tsx`

The current component stores alert rules in `localStorage`. Replace with tRPC queries, keeping `localStorage` as a one-time migration path (import any existing rules into the DB on first load, then clear the key).

- [ ] **Step 1: Locate the existing state and localStorage logic**

```bash
grep -n "localStorage\|setRules\|useState.*rules\|useEffect" src/components/views/RulesView.tsx | head -15
```

Note the line numbers. You will replace the state management block.

- [ ] **Step 2: Replace state management in `src/components/views/RulesView.tsx`**

Find and remove:
```tsx
  const [rules,    setRules]    = useState<AlertRule[]>([]);
  ...
  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('observatory-rules');
      if (raw) setRules(JSON.parse(raw) as AlertRule[]);
    } catch { /* ignore corrupt storage */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('observatory-rules', JSON.stringify(rules));
  }, [rules]);
```

Replace with:

```tsx
  const utils  = trpc.useUtils();
  const { data: rules = [] } = trpc.rules.list.useQuery();
  const upsertRule = trpc.rules.upsert.useMutation({ onSuccess: () => utils.rules.list.invalidate() });
  const deleteRule = trpc.rules.remove.useMutation({ onSuccess: () => utils.rules.list.invalidate() });

  // One-time localStorage migration
  useEffect(() => {
    try {
      const raw = localStorage.getItem('observatory-rules');
      if (!raw) return;
      const stored = JSON.parse(raw) as AlertRule[];
      if (stored.length === 0) return;
      stored.forEach(r => {
        upsertRule.mutate({
          id: undefined, name: r.name, metric: r.metric,
          lookback: r.lookback, operator: r.operator,
          threshold: r.threshold, enabled: r.enabled,
        });
      });
      localStorage.removeItem('observatory-rules');
    } catch { /* ignore corrupt storage */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Update rule creation to use mutation**

Find the `addRule` function (or wherever `setRules` is called to add a rule). Replace with a mutation call.

Locate the add-rule logic with:
```bash
grep -n "setRules\|addRule\|rules\." src/components/views/RulesView.tsx | head -20
```

Find the block that creates a new rule (it builds a new `AlertRule` object and calls `setRules`). Replace it with:

```tsx
upsertRule.mutate({
  id: undefined,
  name:      form.name,
  metric:    form.metric,
  lookback:  form.lookback,
  operator:  form.operator,
  threshold: parseFloat(form.threshold),
  enabled:   true,
});
setShowForm(false);
setForm(BLANK_FORM);
```

- [ ] **Step 4: Update rule toggle (enable/disable) to use mutation**

Find where `enabled` is toggled (a `setRules` call that maps over rules and flips `r.enabled`). Replace with:

```tsx
upsertRule.mutate({ ...rule, threshold: rule.threshold });
```

Where `rule` is the current rule with `enabled: !rule.enabled`. The exact structure depends on the existing toggle function — find it with:
```bash
grep -n "enabled\|toggle" src/components/views/RulesView.tsx
```

- [ ] **Step 5: Update rule deletion to use mutation**

Find the delete handler (a `setRules` call that filters out a rule by id). Replace with:

```tsx
deleteRule.mutate({ id: ruleId });
```

- [ ] **Step 6: Verify build is clean**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully`

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all 144+ tests PASS (139 original + 5 new rules tests)

- [ ] **Step 8: Commit**

```bash
git add src/components/views/RulesView.tsx
git commit -m "feat: persist alert rules to DB via tRPC (replaces localStorage)"
```

---

## Final: PR

- [ ] **Push branch and open PR**

```bash
git push
gh pr create \
  --title "feat: iteration 2 — ingest age, provider filter, services refresh, hydration fix, rules persistence" \
  --body "$(cat <<'EOF'
## Summary

- **Phase 1**: Live ingest age footer — `pulse.lastIngest` polls MAX(ts) every 5s
- **Phase 2**: Provider filter now propagates to WhyInsightsCard + ZombieSessionsCard
- **Phase 3**: ServicesRail invalidates both queries on Add Service save; badge count on + tile
- **Phase 4**: LiveBar hydration warning eliminated (Math.random deferred to useEffect)
- **Phase 5**: Alert rules persisted to PostgreSQL via new `rules` tRPC router; localStorage migration on first load

## Test plan
- [ ] Footer shows live "Xs ago" and updates every 5s
- [ ] Selecting Claude in header filters WhyInsights and ZombieSessions cards
- [ ] Add Service → modal saves → both ServicesRail and + badge update immediately
- [ ] Browser console shows no hydration warnings on load
- [ ] Create a rule → rule persists on page refresh → localStorage key is cleared
- [ ] npm test passes (144+ tests)
EOF
)"
```

---

## File map summary

| File | Change |
|---|---|
| `src/server/routers/pulse.ts` | Add `lastIngest` procedure |
| `src/server/routers/insights.ts` | Add optional `provider` filter to both procedures |
| `src/server/routers/rules.ts` | New: `list`, `upsert`, `remove` procedures |
| `src/server/routers/_app.ts` | Register `rulesRouter` |
| `prisma/schema.prisma` | Add `AlertRule` model |
| `src/app/page.tsx` | `IngestAge` component; pass `providerFilter` to WhyInsightsCard + ZombieSessionsCard |
| `src/components/layout/CommandHeader.tsx` | LiveBar: defer `Math.random()` to `useEffect` |
| `src/components/pulse/ServicesRail.tsx` | `useUtils()` invalidation; badge count |
| `src/components/why/WhyInsightsCard.tsx` | Accept `provider` prop |
| `src/components/why/ZombieSessionsCard.tsx` | Accept `provider` prop |
| `src/components/views/RulesView.tsx` | tRPC mutations; localStorage migration |
| `src/__tests__/routers/pulse-ingest.test.ts` | New |
| `src/__tests__/routers/rules.test.ts` | New |
| `src/__tests__/routers/insights.test.ts` | Add provider-filter tests |
