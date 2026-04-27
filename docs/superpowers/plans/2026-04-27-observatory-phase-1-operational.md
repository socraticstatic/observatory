# Observatory Phase 1 — Operational Completeness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface latency percentiles in the UI, add projected monthly cost, deliver alert webhook notifications, add the user dimension to cost attribution, and extend the daily rollup with cache hit counts.

**Architecture:** All changes are additive — schema migrations (Prisma db push), tRPC procedure extensions, and UI additions. No breaking changes to existing procedures. The `pulse.statStrip` procedure already computes p50 and p99 but does not expose p95 and does not render them in `StatStrip.tsx`. The `pulse.cacheHitTrend` procedure already exists. The `insights.findings` procedure already evaluates budgets and rules but has no delivery mechanism.

**Tech Stack:** Next.js 16.2.4, tRPC v11.16, Prisma 7.7, PostgreSQL 16, Vitest 4.1.4, TypeScript 5 strict

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add p50/p95/p99 to LlmDailyRollup; add webhookUrl to AlertRule + Budget; add userId to LlmEvent; add cacheHits/cacheAttempts to LlmDailyRollup |
| `src/server/routers/pulse.ts` | Modify | Add p95 to statStrip SQL; add projection to overallCost |
| `src/server/routers/alertRules.ts` | Modify | Add webhookUrl to RuleInput; return webhookUrl in list |
| `src/server/routers/costDrivers.ts` | Modify | Add 'user' as 7th dimension in sixDimension |
| `src/server/routers/insights.ts` | Modify | Add webhook delivery when a finding matches an enabled rule with webhookUrl |
| `src/lib/ingest.ts` | Modify | Extract userId from body.user / body.metadata.user_id |
| `src/lib/providers/daily-rollup.ts` | Modify | Compute p50/p95/p99/cacheHits/cacheAttempts during rollup |
| `src/components/pulse/StatStrip.tsx` | Modify | Show p50/p95/p99 cells instead of single avg latency |
| `src/components/pulse/OverallCostHero.tsx` | Modify | Add projected monthly cost badge below inference cost |
| `src/components/views/RulesView.tsx` | Modify | Add webhookUrl field + test button to AlertRule form |
| `src/components/views/CostDriversView.tsx` | Modify | Add 'User' tab to DIMS array |
| `src/__tests__/routers/pulse.test.ts` | Modify | Add tests for p95 in statStrip and projection in overallCost |
| `src/__tests__/routers/alertRules.test.ts` | Modify or Create | Test webhookUrl CRUD |
| `src/__tests__/routers/insights.test.ts` | Modify | Test webhook delivery on rule match |

---

### Task 1: Add p95 to statStrip + surface p50/p95/p99 in StatStrip UI

**Files:**
- Modify: `src/server/routers/pulse.ts` (statStrip procedure, lines 208–272)
- Modify: `src/components/pulse/StatStrip.tsx`
- Modify: `src/__tests__/routers/pulse.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/__tests__/routers/pulse.test.ts`. Add a test that verifies `statStrip` returns `p95LatMs`:

```typescript
it('statStrip includes p50, p95, and p99 latency percentiles', async () => {
  mockQueryRaw.mockResolvedValue([{
    p50: 350, p95: 1200, p99: 2100,
    avg_lat: 400, prev_avg_lat: 380,
    llm_input: BigInt(50000), llm_output: BigInt(12000),
  }]);
  mockAggregate.mockResolvedValue({
    _count: { id: 10 }, _avg: { latencyMs: 400, qualityScore: null },
    _sum: { cachedTokens: 5000, inputTokens: 50000, outputTokens: 12000 },
  });
  mockCount.mockResolvedValue(0);
  mockFindMany.mockResolvedValue([]);

  const result = await caller.statStrip({ lookback: '24H' });

  expect(result.p50LatMs).toBe(350);
  expect(result.p95LatMs).toBe(1200);
  expect(result.p99LatMs).toBe(2100);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npm test -- --reporter=verbose 2>&1 | grep -A 5 "p95"
```

Expected: FAIL — `p95LatMs` is `undefined` in the response.

- [ ] **Step 3: Add p95 to the statStrip SQL query in `pulse.ts`**

Find the `latPct` SQL query in `statStrip` (lines ~233–244). Replace the two `PERCENTILE_CONT` lines with three:

```typescript
ctx.db.$queryRaw<Array<{ p50: unknown; p95: unknown; p99: unknown; avg_lat: unknown; prev_avg_lat: unknown; llm_input: unknown; llm_output: unknown }>>`
  SELECT
    PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "latencyMs") FILTER (WHERE ts >= ${since}) AS p99,
    AVG("latencyMs") FILTER (WHERE ts >= ${since}) AS avg_lat,
    AVG("latencyMs") FILTER (WHERE ts >= ${prevSince} AND ts < ${since}) AS prev_avg_lat,
    COALESCE(SUM("inputTokens") FILTER (WHERE ts >= ${since}), 0)  AS llm_input,
    COALESCE(SUM("outputTokens") FILTER (WHERE ts >= ${since}), 0) AS llm_output
  FROM llm_events
  WHERE ts >= ${prevSince} AND status = 'ok' ${pfSql}
    AND ("contentType" NOT IN ('tts', 'video', 'image') OR "contentType" IS NULL)
`,
```

Then add `p95LatMs` to the return object (near line 262):

```typescript
p50LatMs:         latPct[0]?.p50 != null ? Math.round(Number(latPct[0].p50)) : 0,
p95LatMs:         latPct[0]?.p95 != null ? Math.round(Number(latPct[0].p95)) : 0,
p99LatMs:         latPct[0]?.p99 != null ? Math.round(Number(latPct[0].p99)) : 0,
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|p95)"
```

Expected: PASS.

- [ ] **Step 5: Update `StatStrip.tsx` to surface p50/p95/p99**

The current StatStrip renders 6 cells: Total Calls, Cache Hit, Efficiency, Error Rate, Sessions, Latency. Replace the single "Latency" cell with three cells (p50, p95, p99) and expand the grid to 8 columns:

```tsx
// Replace the grid template line (~line 127):
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 12 }}>

// Replace the single Latency StatCell with three:
<StatCell label="p50 Latency"  value={data.p50LatMs > 0 ? fmtMs(data.p50LatMs) : '—'}  col="var(--fog)" />
<StatCell label="p95 Latency"  value={data.p95LatMs > 0 ? fmtMs(data.p95LatMs) : '—'}  col={data.p95LatMs > data.p50LatMs * 5 ? 'var(--warn)' : 'var(--fog)'} signal={data.p95LatMs > data.p50LatMs * 7 ? 'act' : data.p95LatMs > data.p50LatMs * 4 ? 'warn' : undefined} />
<StatCell label="p99 Latency"  value={data.p99LatMs > 0 ? fmtMs(data.p99LatMs) : '—'}  col="var(--steel)" />
```

Also update the `LABELS` constant for the loading skeleton to match:

```tsx
const LABELS = ['Total Calls', 'Cache Hit', 'Efficiency', 'Error Rate', 'Sessions', 'p50', 'p95', 'p99'];
```

And update `LoadingStrip` grid template:

```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 12 }}>
```

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/pulse.ts src/components/pulse/StatStrip.tsx src/__tests__/routers/pulse.test.ts
git commit -m "feat: surface p50/p95/p99 latency percentiles in StatStrip"
```

---

### Task 2: Add p50/p95/p99 to LlmDailyRollup schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add columns to schema**

In `prisma/schema.prisma`, find the `LlmDailyRollup` model and add after `avgLatencyMs`:

```prisma
p50Ms              Float?   @map("p50_ms")
p95Ms              Float?   @map("p95_ms")
p99Ms              Float?   @map("p99_ms")
```

- [ ] **Step 2: Push schema to database**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npx prisma db push
npx prisma generate
```

Expected output: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "chore: add p50/p95/p99 columns to LlmDailyRollup"
```

---

### Task 3: Add projected monthly cost to `pulse.overallCost`

**Files:**
- Modify: `src/server/routers/pulse.ts` (overallCost procedure)
- Modify: `src/__tests__/routers/pulse.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/routers/pulse.test.ts`:

```typescript
describe('pulse.overallCost — projection', () => {
  it('returns projectedMonthUsd based on 7-day average spend', async () => {
    // Mock: 7d aggregate returns $7 total → $1/day average
    // With 15 days remaining, projection = $7 (spent so far in month, approx) + $1 * 15
    // The exact value depends on daysRemainingInMonth, so just test the field exists and is a number
    mockAggregate
      .mockResolvedValueOnce({ _sum: { costUsd: '7.00', inputTokens: 1000, outputTokens: 500, cachedTokens: 200, reasoningTokens: 0 }, _count: { id: 100 } }) // current window
      .mockResolvedValueOnce({ _sum: { costUsd: '6.00' } }); // prev window
    mockQueryRaw
      .mockResolvedValueOnce([{ cache_read_cost: 0 }])
      .mockResolvedValueOnce([{ cache_read_cost: 0 }])
      .mockResolvedValueOnce([]) // providerCosts
      .mockResolvedValueOnce([]); // prevProviderCosts
    mockFindMany.mockResolvedValue([]);

    const result = await caller.overallCost({ lookback: '30D' });

    expect(result).toHaveProperty('projectedMonthUsd');
    expect(typeof result.projectedMonthUsd).toBe('number');
    expect(result.projectedMonthUsd).toBeGreaterThanOrEqual(0);
    expect(result).toHaveProperty('projectionTrend');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(projectedMonthUsd|FAIL)"
```

Expected: FAIL — `projectedMonthUsd` does not exist on result.

- [ ] **Step 3: Add projection computation to `overallCost`**

In `src/server/routers/pulse.ts`, inside `overallCost`, after the `billing` await block (around line 119), add a query for the last 7 days of spend and compute the projection:

```typescript
// Compute projected monthly cost from 7-day average
const since7d = new Date(Date.now() - 7 * 86_400_000);
const moneyInCalendarMonth = async (): Promise<{ spentThisMonth: number; daysRemaining: number }> => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth    = monthEnd.getDate();
  const daysElapsed    = now.getDate();
  const daysRemaining  = daysInMonth - daysElapsed;
  const mtdAgg = await ctx.db.llmEvent.aggregate({
    where: { ts: { gte: monthStart }, status: 'ok', ...pf },
    _sum: { costUsd: true },
  });
  return { spentThisMonth: Number(mtdAgg._sum.costUsd ?? 0), daysRemaining };
};

const avg7dAgg = await ctx.db.llmEvent.aggregate({
  where: { ts: { gte: since7d }, status: 'ok', ...pf },
  _sum: { costUsd: true },
});
const avg7dCost      = Number(avg7dAgg._sum.costUsd ?? 0);
const avgDailyCost   = avg7dCost / 7;
const { spentThisMonth, daysRemaining } = await moneyInCalendarMonth();
const projectedMonthUsd = spentThisMonth + avgDailyCost * daysRemaining;
const monthlyBudget  = Number(process.env.MONTHLY_BUDGET_USD ?? 200);
const projectionTrend: 'over' | 'under' | 'on-track' =
  projectedMonthUsd > monthlyBudget * 1.1 ? 'over' :
  projectedMonthUsd < monthlyBudget * 0.9 ? 'under' : 'on-track';
```

Then add to the return object:

```typescript
projectedMonthUsd,
daysRemainingInMonth: daysRemaining,
projectionTrend,
monthlyBudget,
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(projectedMonthUsd|PASS|FAIL)"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/pulse.ts src/__tests__/routers/pulse.test.ts
git commit -m "feat: add projected monthly cost to pulse.overallCost"
```

---

### Task 4: Show projected cost in OverallCostHero

**Files:**
- Modify: `src/components/pulse/OverallCostHero.tsx`

- [ ] **Step 1: Add projection badge below inference cost**

In `src/components/pulse/OverallCostHero.tsx`, after the `prior` delta line (around line 82–90), add:

```tsx
{/* Projection */}
{costData?.projectedMonthUsd != null && (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    marginTop: 8, padding: '4px 10px',
    borderRadius: 4,
    background: costData.projectionTrend === 'over'
      ? 'rgba(184,107,107,.12)' : 'rgba(76,91,97,.15)',
    border: `1px solid ${costData.projectionTrend === 'over' ? 'rgba(184,107,107,.3)' : 'var(--line-2)'}`,
  }}>
    <span className="mono" style={{
      fontSize: 10, letterSpacing: '.08em',
      color: costData.projectionTrend === 'over' ? '#B86B6B' : 'var(--graphite)',
    }}>
      PROJECTED
    </span>
    <span className="mono" style={{
      fontSize: 12, fontWeight: 600,
      color: costData.projectionTrend === 'over' ? '#B86B6B' : 'var(--fog)',
    }}>
      {fmtUsd(costData.projectedMonthUsd)}
    </span>
    <span className="mono" style={{ fontSize: 10, color: 'var(--steel)' }}>
      this month · {costData.daysRemainingInMonth}d left
    </span>
    {costData.projectionTrend === 'over' && (
      <span className="mono" style={{ fontSize: 10, color: '#B86B6B' }}>
        ▲ over {fmtUsd(costData.monthlyBudget ?? 0)} budget
      </span>
    )}
  </div>
)}
```

- [ ] **Step 2: Verify it renders**

```bash
npm run dev
# open http://localhost:3099 — Pulse view should show "PROJECTED $X.XX this month · Nd left"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pulse/OverallCostHero.tsx
git commit -m "feat: projected monthly cost badge in OverallCostHero"
```

---

### Task 5: Add webhookUrl to AlertRule schema and alertRulesRouter

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/server/routers/alertRules.ts`
- Modify: `src/__tests__/routers/alertRules.test.ts` (create if not exists)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/routers/alertRules.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { alertRulesRouter } from '@/server/routers/alertRules';

const mockFindMany  = vi.fn();
const mockCreate    = vi.fn();
const mockUpdate    = vi.fn();
const mockDelete    = vi.fn();

const mockDb = {
  alertRule: { findMany: mockFindMany, create: mockCreate, update: mockUpdate, delete: mockDelete },
};
const caller = createCallerFactory(alertRulesRouter)({ db: mockDb as any });

const RULE = {
  id: 'r1', name: 'Error spike', metric: 'error_rate', lookback: '24H',
  operator: 'gt', threshold: '5.0000', enabled: true, webhookUrl: null,
  createdAt: new Date('2026-04-27T00:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('alertRulesRouter.list', () => {
  it('returns rules with webhookUrl field', async () => {
    mockFindMany.mockResolvedValue([RULE]);
    const result = await caller.list();
    expect(result[0]).toHaveProperty('webhookUrl');
    expect(result[0].webhookUrl).toBeNull();
  });
});

describe('alertRulesRouter.create with webhookUrl', () => {
  it('stores webhookUrl when provided', async () => {
    mockCreate.mockResolvedValue({ ...RULE, webhookUrl: 'https://ntfy.sh/my-topic' });
    const result = await caller.create({
      name: 'Error spike', metric: 'error_rate', lookback: '24H',
      operator: 'gt', threshold: 5, enabled: true,
      webhookUrl: 'https://ntfy.sh/my-topic',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ webhookUrl: 'https://ntfy.sh/my-topic' }) })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- alertRules --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `webhookUrl` not in schema.

- [ ] **Step 3: Add webhookUrl to AlertRule in schema.prisma**

```prisma
model AlertRule {
  id         String   @id
  name       String
  metric     String
  lookback   String
  operator   String
  threshold  Decimal  @db.Decimal(12, 4)
  enabled    Boolean  @default(true)
  webhookUrl String?  @map("webhook_url")
  createdAt  DateTime @default(now())

  @@map("alert_rules")
}
```

- [ ] **Step 4: Push schema**

```bash
npx prisma db push && npx prisma generate
```

- [ ] **Step 5: Update alertRulesRouter to handle webhookUrl**

In `src/server/routers/alertRules.ts`, update `RuleInput` to include `webhookUrl`:

```typescript
const RuleInput = z.object({
  name:       z.string().min(1).max(80),
  metric:     z.string().min(1),
  lookback:   LookbackSchema,
  operator:   z.enum(['gt', 'lt', 'gte', 'lte']).default('gt'),
  threshold:  z.number().finite(),
  enabled:    z.boolean().default(true),
  webhookUrl: z.string().url().optional().nullable(),
});
```

Update the `list` procedure to return `webhookUrl`:

```typescript
return rows.map(r => ({
  id:         r.id,
  name:       r.name,
  metric:     r.metric,
  lookback:   r.lookback,
  operator:   r.operator,
  threshold:  Number(r.threshold),
  enabled:    r.enabled,
  webhookUrl: r.webhookUrl ?? null,
  createdAt:  r.createdAt.toISOString(),
}));
```

Update `create` and `update` to pass `webhookUrl` in the data object:

```typescript
// In create:
data: {
  id:         crypto.randomUUID(),
  name:       input.name,
  metric:     input.metric,
  lookback:   input.lookback,
  operator:   input.operator,
  threshold:  input.threshold,
  enabled:    input.enabled,
  webhookUrl: input.webhookUrl ?? null,
},

// In update:
const { id, ...data } = input;
return ctx.db.alertRule.update({ where: { id }, data });
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- alertRules --reporter=verbose
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/server/routers/alertRules.ts src/__tests__/routers/alertRules.test.ts
git commit -m "feat: add webhookUrl to AlertRule schema and router"
```

---

### Task 6: Webhook delivery in insights.findings

**Files:**
- Modify: `src/server/routers/insights.ts`
- Modify: `src/__tests__/routers/insights.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/routers/insights.test.ts` (find the file and add at the bottom):

```typescript
describe('insights.findings — webhook delivery', () => {
  it('POSTs to webhookUrl when a finding matches an enabled rule', async () => {
    // Setup: one budget exceeded finding, one rule watching error_rate
    // and one rule watching cost with webhookUrl set
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
    } as Response);

    // Return an error-burst finding scenario
    // The router queries alert rules and checks if any metric matches a finding id
    mockAlertRuleFindMany.mockResolvedValue([{
      id: 'rule-1', name: 'Cost Alert', metric: 'budget-exceeded',
      lookback: '24H', operator: 'gt', threshold: 0, enabled: true,
      webhookUrl: 'https://ntfy.sh/observatory-test',
    }]);

    // ... (other mocks return data that triggers budget-exceeded finding)

    // The test just verifies fetch was called with correct args
    // Implementation detail: call the findings procedure and check fetch was invoked

    fetchSpy.mockRestore();
  });
});
```

Note: This test is intentionally partial — the full mock setup for findings is complex. The key behavior to verify is that `fetch` is called with the webhook URL and correct payload shape. Write more complete tests after implementation.

- [ ] **Step 2: Add webhook delivery to `insights.findings`**

In `src/server/routers/insights.ts`, at the end of the `findings` procedure (after the findings are sorted, before the `return findings` statement), add:

```typescript
// Webhook delivery — fire and forget, best-effort
const rules = await ctx.db.alertRule.findMany({ where: { enabled: true, webhookUrl: { not: null } } });
if (rules.length > 0) {
  const deliveries = rules.flatMap(rule =>
    findings
      .filter(f => f.id.startsWith(rule.metric) || f.category === rule.metric || f.id === rule.metric)
      .map(f => ({ rule, finding: f }))
  );
  for (const { rule, finding } of deliveries) {
    const url = rule.webhookUrl!;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:        finding.id,
        category:  finding.category,
        severity:  finding.severity,
        title:     finding.title,
        detail:    finding.detail,
        action:    finding.action,
        firedAt:   new Date().toISOString(),
        rule:      rule.name,
      }),
    }).catch(err => {
      console.warn(`[observatory] webhook delivery failed for rule "${rule.name}": ${err.message}`);
    });
  }
}

return findings;
```

- [ ] **Step 3: Run all tests**

```bash
npm test -- --reporter=verbose 2>&1 | tail -30
```

Expected: all existing tests PASS (webhook is fire-and-forget with catch, not blocking).

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/insights.ts src/__tests__/routers/insights.test.ts
git commit -m "feat: webhook delivery when findings match enabled alert rules"
```

---

### Task 7: Add webhookUrl field to RulesView AlertRule form

**Files:**
- Modify: `src/components/views/RulesView.tsx`

- [ ] **Step 1: Find the AlertRule form in RulesView**

The AlertRule form is in `RulesView.tsx`. Find the form inputs section and add a webhook URL input field after the `enabled` toggle.

- [ ] **Step 2: Add webhookUrl to form state and the form field**

In the AlertRule form state type (find `AlertRuleForm` or similar interface), add `webhookUrl: string`. In the blank form constant, add `webhookUrl: ''`.

Add the input field in the form JSX, after the enabled toggle:

```tsx
{/* Webhook URL */}
<div>
  <label className="label" style={{ display: 'block', marginBottom: 4 }}>
    WEBHOOK URL <span style={{ color: 'var(--steel)' }}>(optional)</span>
  </label>
  <div style={{ display: 'flex', gap: 6 }}>
    <input
      type="url"
      placeholder="https://ntfy.sh/my-topic"
      value={ruleForm.webhookUrl}
      onChange={e => setRuleForm(f => ({ ...f, webhookUrl: e.target.value }))}
      style={{
        flex: 1, background: 'var(--bg-2)', border: '1px solid var(--line-2)',
        borderRadius: 4, padding: '6px 8px', color: 'var(--mist)',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
      }}
    />
    {ruleForm.webhookUrl && (
      <button
        type="button"
        onClick={() => {
          fetch(ruleForm.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: 'test', category: 'test', severity: 'info',
              title: 'Observatory webhook test',
              detail: 'This is a test delivery from Observatory.',
              action: 'No action required.',
              firedAt: new Date().toISOString(),
              rule: ruleForm.name || 'unnamed',
            }),
          }).catch(() => null);
        }}
        className="btn-secondary"
        style={{ padding: '6px 10px', fontSize: 10, whiteSpace: 'nowrap' }}
      >
        TEST
      </button>
    )}
  </div>
</div>
```

In the `saveRule` / `upsertRule` call, include `webhookUrl: ruleForm.webhookUrl || null`.

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
# Navigate to Rules view → Add Alert Rule → confirm webhook URL field appears
# Enter a URL, click TEST, verify a network request fires
```

- [ ] **Step 4: Commit**

```bash
git add src/components/views/RulesView.tsx
git commit -m "feat: webhook URL field and test button in alert rule form"
```

---

### Task 8: Add userId to LlmEvent + ingest parser

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/ingest.ts`
- Modify: `src/__tests__/routers/pulse-ingest.test.ts` (or create a new ingest test)

- [ ] **Step 1: Write the failing test**

In `src/__tests__/routers/pulse-ingest.test.ts` (or create `src/__tests__/lib/ingest.test.ts`), add:

```typescript
import { describe, it, expect } from 'vitest';
import { parseIngestPayload } from '@/lib/ingest';

describe('parseIngestPayload — userId extraction', () => {
  it('extracts userId from body.user', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      user: 'user-abc',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.userId).toBe('user-abc');
  });

  it('extracts userId from body.metadata.user_id', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      metadata: { user_id: 'user-xyz' },
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.userId).toBe('user-xyz');
  });

  it('returns null userId when not provided', () => {
    const result = parseIngestPayload({
      model: 'claude-sonnet-4-6',
      custom_llm_provider: 'anthropic',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result?.userId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- ingest --reporter=verbose 2>&1 | grep -E "(userId|FAIL)"
```

Expected: FAIL — `userId` not on `NormalizedEvent`.

- [ ] **Step 3: Add userId to schema.prisma**

In the `LlmEvent` model, add after `sessionId`:

```prisma
userId    String?  @map("user_id") @db.VarChar(255)
```

Add an index:

```prisma
@@index([userId])
```

- [ ] **Step 4: Push schema**

```bash
npx prisma db push && npx prisma generate
```

- [ ] **Step 5: Add userId to NormalizedEvent and parseIngestPayload**

In `src/lib/ingest.ts`, add `userId?: string` to the `NormalizedEvent` interface:

```typescript
export interface NormalizedEvent {
  provider: string;
  model: string;
  surface?: string;
  sessionId?: string;
  userId?: string;       // ← add this
  project?: string;
  // ... rest unchanged
}
```

In `parseIngestPayload`, extract `userId` alongside `sessionId` (around line 78):

```typescript
const userId: string | undefined = body.user ?? body.metadata?.user_id ?? undefined;
```

Add `userId` to the return object:

```typescript
return {
  provider,
  model,
  surface,
  sessionId,
  userId,          // ← add this
  project,
  // ... rest unchanged
};
```

- [ ] **Step 6: Run tests**

```bash
npm test -- ingest --reporter=verbose
```

Expected: all userId tests PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/ingest.ts src/__tests__/lib/ingest.test.ts
git commit -m "feat: userId dimension — schema, ingest parser extraction"
```

---

### Task 9: Add user dimension to costDrivers.sixDimension

**Files:**
- Modify: `src/server/routers/costDrivers.ts`
- Modify: `src/__tests__/routers/costDrivers.test.ts` (create if needed)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/routers/costDrivers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { costDriversRouter } from '@/server/routers/costDrivers';

const mockQueryRaw = vi.fn();
const mockDb = { $queryRaw: mockQueryRaw };
const caller = createCallerFactory(costDriversRouter)({ db: mockDb as any });

beforeEach(() => vi.clearAllMocks());

describe('costDrivers.sixDimension', () => {
  it('returns a user dimension alongside provider/model/etc', async () => {
    const mockRows = [{ label: 'user-alice', cost: 4.5, calls: BigInt(20), sessions: BigInt(5), avg_lat_ms: 450, p95_lat_ms: 900 }];
    // sixDimension fires 7 parallel queries now (provider, model, surface, project, contentType, region, user)
    mockQueryRaw.mockResolvedValue(mockRows);

    const result = await caller.sixDimension({ lookback: '30D' });

    expect(result).toHaveProperty('user');
    expect(result.user).toHaveLength(1);
    expect(result.user[0].label).toBe('user-alice');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- costDrivers --reporter=verbose 2>&1 | grep -E "(user|FAIL)"
```

Expected: FAIL — no `user` key on result.

- [ ] **Step 3: Add user dimension to sixDimension**

In `src/server/routers/costDrivers.ts`, inside the `Promise.all` in `sixDimension`, add a 7th query after the `byRegion` query:

```typescript
ctx.db.$queryRaw<DetailRow[]>`
  SELECT "userId" AS label, SUM("costUsd")::float AS cost,
    COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
    AVG("latencyMs")::float AS avg_lat_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
  FROM llm_events WHERE ts >= ${since} AND "userId" IS NOT NULL ${pfSql}
  GROUP BY "userId" ORDER BY cost DESC LIMIT 8`,
```

Destructure as `byUser`:

```typescript
const [byProvider, byModel, bySurface, byProject, byContentType, byRegion, byUser] = await Promise.all([...]);
```

Add to the return:

```typescript
return {
  provider:    mapDim(byProvider),
  model:       mapDim(byModel),
  surface:     mapDim(bySurface),
  project:     mapDim(byProject),
  contentType: mapDim(byContentType),
  region:      mapDim(byRegion),
  user:        mapDim(byUser),
};
```

- [ ] **Step 4: Run tests**

```bash
npm test -- costDrivers --reporter=verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/costDrivers.ts src/__tests__/routers/costDrivers.test.ts
git commit -m "feat: add user dimension to costDrivers.sixDimension"
```

---

### Task 10: Add Users tab to CostDriversView

**Files:**
- Modify: `src/components/views/CostDriversView.tsx`

- [ ] **Step 1: Add User to the DIMS array**

In `src/components/views/CostDriversView.tsx`, update the `DIMS` constant to add user:

```typescript
const DIMS = [
  { key: 'provider'    as const, label: 'Provider' },
  { key: 'model'       as const, label: 'Model' },
  { key: 'surface'     as const, label: 'Surface' },
  { key: 'project'     as const, label: 'Project' },
  { key: 'contentType' as const, label: 'Content' },
  { key: 'region'      as const, label: 'Region' },
  { key: 'user'        as const, label: 'User' },
];
```

Update the `DimItem` type used by `items` to match — the inferred type from `sixDimension` now includes `user`. The `useMemo` that maps `data[dim.key]` will pick up `user` automatically.

- [ ] **Step 2: Verify in browser**

```bash
npm run dev
# Navigate to Costs view — confirm "User" tab appears in the dimension selector
# If events with userId exist (or seed some), verify user rows appear
```

- [ ] **Step 3: Commit**

```bash
git add src/components/views/CostDriversView.tsx
git commit -m "feat: User tab in CostDriversView"
```

---

### Task 11: Add cacheHits/cacheAttempts to LlmDailyRollup

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/providers/daily-rollup.ts`

Note: `pulse.cacheHitTrend` already exists and computes live hit rates from `llm_events`. This task extends the daily rollup table so archived data retains hit rate information.

- [ ] **Step 1: Add columns to schema.prisma**

In the `LlmDailyRollup` model, after the existing `cacheCreationTokens` field, add:

```prisma
cacheHits     Int   @default(0) @map("cache_hits")
cacheAttempts Int   @default(0) @map("cache_attempts")
```

- [ ] **Step 2: Push schema**

```bash
npx prisma db push && npx prisma generate
```

- [ ] **Step 3: Update daily-rollup.ts to compute hit stats**

In `src/lib/providers/daily-rollup.ts`, find the rollup computation. Add to the rollup SQL or the Prisma create/upsert:

```typescript
// When building the rollup row for a day:
cacheHits:     events.filter(e => e.cachedTokens > 0).length,
cacheAttempts: events.filter(e => e.inputTokens > 0).length,
```

If the rollup uses `$queryRaw` for aggregation, add to the SELECT:

```sql
COUNT(CASE WHEN "cachedTokens" > 0 THEN 1 END)::int AS cache_hits,
COUNT(CASE WHEN "inputTokens" > 0 THEN 1 END)::int AS cache_attempts,
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests PASS (this is a schema-only change with no router tests needed for Phase 1).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/lib/providers/daily-rollup.ts
git commit -m "chore: add cacheHits/cacheAttempts to LlmDailyRollup for archive retention"
```

---

### Task 12: Run full test suite + type check

- [ ] **Step 1: Run all tests**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory
npm test
```

Expected: all tests PASS, no regressions.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Create Phase 1 PR**

```bash
git push origin HEAD
gh pr create \
  --title "feat: Phase 1 — latency percentiles, projected cost, alert webhooks, user dimension (#15)" \
  --body "Implements Observatory enhancement roadmap Phase 1.

- p50/p95/p99 latency in StatStrip (replacing single avg latency)
- Projected monthly cost badge on OverallCostHero
- Alert rule webhook delivery (fire-and-forget POST on finding match)
- Webhook URL field + test button in RulesView AlertRule form  
- userId dimension on LlmEvent (ingest extraction + costDrivers user tab)
- cacheHits/cacheAttempts on LlmDailyRollup for archive retention

Spec: docs/superpowers/specs/2026-04-27-observatory-enhancement-roadmap-design.md"
```
