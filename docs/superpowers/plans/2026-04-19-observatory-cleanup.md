# Observatory Cleanup: Dead Code + Real Data Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all `makeRng` / fake data, migrate all `@/lib/models` imports to `@/lib/lookback`, wire `PulseBar` to real `pulseChart` data, and delete five dead files.

**Architecture:** All chart components already call tRPC for real data; the `makeRng` calls are loading-state fallbacks that were never removed. This plan replaces each fake fallback with an empty array + loading guard, then deletes the dead modules. `PulseBar` is the only component that still receives fake arrays via props from `page.tsx`; it gets an internal tRPC query instead.

**Tech Stack:** Next.js 16, tRPC v11, TanStack Query v5, TypeScript strict

---

## File Structure

```
src/
  lib/
    lookback.ts           MODIFY — add LOOKBACKS alias
    rng.ts                DELETE
    models.ts             DELETE
  app/
    page.tsx              MODIFY — remove makeRng import + fake pulseData, fix Lookback import
    login/page.tsx        DELETE
    api/auth/route.ts     DELETE
    middleware.ts         DELETE
  components/
    pulse/
      PulseBar.tsx        MODIFY — add internal tRPC queries, drop 5 fake props
      OverallCostHero.tsx MODIFY — remove makeRng + buildSparkData, fix LOOKBACKS import
    fiveW/
      WhatCard.tsx        MODIFY — remove makeRng + buildData, add empty guard
      WhenCard.tsx        MODIFY — remove makeRng + buildMatrix, replace with zero matrix
      EventTimelineCard.tsx MODIFY — remove makeRng + fallbackData, add empty guard
      WhoCard.tsx         MODIFY — remove makeRng + MODELS, define local ModelRow type
    layout/
      CommandHeader.tsx   MODIFY — fix LOOKBACKS import
    pulse/StatStrip.tsx   MODIFY — fix Lookback import
    pulse/BurnRateRail.tsx MODIFY — fix Lookback import
    pulse/ServicesRail.tsx MODIFY — fix Lookback import
    diagnostics/EntityExplorer.tsx MODIFY — fix Lookback import
```

---

## Task 1: Add LOOKBACKS alias to lookback.ts

**Files:**
- Modify: `src/lib/lookback.ts`

`LOOKBACK_CONFIG` already has `label` and `n`. Adding a `LOOKBACKS` re-export lets all 10 consumer files change only their import path, not their usage.

- [ ] **Step 1: Add export to lookback.ts**

Append to the end of `src/lib/lookback.ts`:

```typescript
// Alias for components that destructure { label } or { n }
export const LOOKBACKS = LOOKBACK_CONFIG;
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory/.claude/worktrees/condescending-lamport-20a14c
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no new errors (no consumers changed yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/lookback.ts
git commit -m "feat(lib): export LOOKBACKS alias from lookback.ts"
```

---

## Task 2: Migrate all @/lib/models imports to @/lib/lookback

**Files:**
- Modify: `src/components/pulse/OverallCostHero.tsx`
- Modify: `src/components/pulse/PulseBar.tsx`
- Modify: `src/components/pulse/StatStrip.tsx`
- Modify: `src/components/pulse/BurnRateRail.tsx`
- Modify: `src/components/pulse/ServicesRail.tsx`
- Modify: `src/components/fiveW/WhatCard.tsx`
- Modify: `src/components/fiveW/WhoCard.tsx`
- Modify: `src/components/layout/CommandHeader.tsx`
- Modify: `src/components/diagnostics/EntityExplorer.tsx`
- Modify: `src/app/page.tsx`

Each file has exactly one import line to change. `WhoCard.tsx` also imports `MODELS` and `Model`; handle those in Task 7.

- [ ] **Step 1: Update OverallCostHero import**

In `src/components/pulse/OverallCostHero.tsx` line 5, change:
```typescript
import { LOOKBACKS, type Lookback } from '@/lib/models';
```
to:
```typescript
import { LOOKBACKS, type Lookback } from '@/lib/lookback';
```

- [ ] **Step 2: Update PulseBar import**

In `src/components/pulse/PulseBar.tsx` line 5, change:
```typescript
import { LOOKBACKS, Lookback } from '@/lib/models';
```
to:
```typescript
import { LOOKBACKS, Lookback } from '@/lib/lookback';
```

- [ ] **Step 3: Update StatStrip import**

In `src/components/pulse/StatStrip.tsx` line 3, change:
```typescript
import { type Lookback } from '@/lib/models';
```
to:
```typescript
import { type Lookback } from '@/lib/lookback';
```

- [ ] **Step 4: Update BurnRateRail import**

In `src/components/pulse/BurnRateRail.tsx` line 3, change:
```typescript
import { type Lookback } from '@/lib/models';
```
to:
```typescript
import { type Lookback } from '@/lib/lookback';
```

- [ ] **Step 5: Update ServicesRail import**

In `src/components/pulse/ServicesRail.tsx` line 7, change:
```typescript
import type { Lookback } from '@/lib/models';
```
to:
```typescript
import type { Lookback } from '@/lib/lookback';
```

- [ ] **Step 6: Update WhatCard import**

In `src/components/fiveW/WhatCard.tsx` line 6, change:
```typescript
import { LOOKBACKS, Lookback } from '@/lib/models';
```
to:
```typescript
import { LOOKBACKS, Lookback } from '@/lib/lookback';
```

- [ ] **Step 7: Update CommandHeader import**

In `src/components/layout/CommandHeader.tsx` line 4, change:
```typescript
import { Lookback, LOOKBACKS } from '@/lib/models';
```
to:
```typescript
import { Lookback, LOOKBACKS } from '@/lib/lookback';
```

- [ ] **Step 8: Update EntityExplorer import**

In `src/components/diagnostics/EntityExplorer.tsx` line 6, change:
```typescript
import type { Lookback } from '@/lib/models';
```
to:
```typescript
import type { Lookback } from '@/lib/lookback';
```

- [ ] **Step 9: Update page.tsx import**

In `src/app/page.tsx` line 33, change:
```typescript
import type { Lookback } from '@/lib/models';
```
to:
```typescript
import type { Lookback } from '@/lib/lookback';
```

- [ ] **Step 10: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors (LOOKBACKS and Lookback now come from lookback.ts).

- [ ] **Step 11: Commit**

```bash
git add src/components src/app/page.tsx
git commit -m "refactor: migrate all @/lib/models imports to @/lib/lookback"
```

---

## Task 3: Remove makeRng from OverallCostHero

**Files:**
- Modify: `src/components/pulse/OverallCostHero.tsx`

`buildSparkData` generates fake cost sparkline data as fallback. `chartData` (real tRPC data) is already the primary path. Replace fallback with `[]`.

- [ ] **Step 1: Remove makeRng import and buildSparkData function**

In `src/components/pulse/OverallCostHero.tsx`:

Remove line 4:
```typescript
import { makeRng } from '@/lib/rng';
```

Remove the entire `buildSparkData` function (lines 43–51):
```typescript
function buildSparkData(lookback: Lookback): number[] {
  const rng = makeRng(3);
  const { n, costMul } = LOOKBACKS[lookback];
  const base = 21.72 * costMul / n;
  return Array.from({ length: n }, (_, i) => {
    const trend = 1 + (i / n) * 0.18;
    return base * trend * (0.7 + rng() * 0.6);
  });
}
```

- [ ] **Step 2: Replace buildSparkData call**

Change line ~63:
```typescript
const data  = chartData ? chartData.map(r => r.cost) : buildSparkData(lookback);
```
to:
```typescript
const data  = chartData?.map(r => r.cost) ?? [];
```

- [ ] **Step 3: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pulse/OverallCostHero.tsx
git commit -m "refactor(OverallCostHero): remove makeRng, use empty array fallback"
```

---

## Task 4: Remove makeRng from WhatCard

**Files:**
- Modify: `src/components/fiveW/WhatCard.tsx`

`buildData` generates fake bar data when `rawData` is null. Replace with empty array and add loading guard (the chart's `Math.max(...data.map(...))` breaks on empty input).

- [ ] **Step 1: Remove makeRng import and buildData function**

In `src/components/fiveW/WhatCard.tsx`:

Remove line 5:
```typescript
import { makeRng } from '@/lib/rng';
```

Remove the entire `buildData` function (lines 25–37):
```typescript
function buildData(lookback: Lookback): Bar[] {
  const r = makeRng(9 + lookback.charCodeAt(0));
  const n = LOOKBACKS[lookback].n;
  return Array.from({ length: n }, () => {
    const base = 800 + r() * 3200;
    return {
      cached:    Math.round(base * (0.3 + r() * 0.2)),
      input:     Math.round(base * (0.15 + r() * 0.15)),
      output:    Math.round(base * (0.2 + r() * 0.15)),
      reasoning: Math.round(base * (0.05 + r() * 0.1)),
    };
  });
}
```

- [ ] **Step 2: Replace buildData fallback with empty array**

Change lines ~267–274 in the `WhatCard` export function:
```typescript
const data: Bar[] = rawData
  ? rawData.map(r => ({
      cached: r.cached,
      input: r.input,
      output: r.output,
      reasoning: r.reasoning,
    }))
  : buildData(lookback);
```
to:
```typescript
const data: Bar[] = rawData?.map(r => ({
  cached: r.cached,
  input: r.input,
  output: r.output,
  reasoning: r.reasoning,
})) ?? [];
```

- [ ] **Step 3: Add empty-data loading guard**

Immediately after the `data` declaration (before the `useEffect` for the ResizeObserver), add:

```typescript
if (!data.length) return (
  <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
    <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
  </div>
);
```

- [ ] **Step 4: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/fiveW/WhatCard.tsx
git commit -m "refactor(WhatCard): remove makeRng, show loading state when no data"
```

---

## Task 5: Remove makeRng from WhenCard

**Files:**
- Modify: `src/components/fiveW/WhenCard.tsx`

`buildMatrix()` runs at module load time and produces a seeded random heatmap as fallback. Replace with a zero-filled matrix.

- [ ] **Step 1: Remove makeRng import and buildMatrix function**

In `src/components/fiveW/WhenCard.tsx`:

Remove line 4:
```typescript
import { makeRng } from '@/lib/rng';
```

Remove the entire `buildMatrix` function (lines 27–37):
```typescript
function buildMatrix(): number[][] {
  const r = makeRng(21);
  return Array.from({ length: DAYS }, (_, d) =>
    Array.from({ length: HOURS }, (_, h) => {
      const dayPart  = 0.2 + 0.8 * Math.max(0, Math.sin((h - 6) / 24 * Math.PI));
      const weekPart = (d % 7 === 5 || d % 7 === 6) ? 0.4 : 1;
      const noise    = 0.4 + r() * 0.6;
      return Math.min(1, dayPart * weekPart * noise);
    })
  );
}
```

- [ ] **Step 2: Replace FALLBACK_MATRIX with zero matrix**

Change line 39:
```typescript
const FALLBACK_MATRIX = buildMatrix();
```
to:
```typescript
const FALLBACK_MATRIX: number[][] = Array.from({ length: DAYS }, () => Array(HOURS).fill(0));
```

- [ ] **Step 3: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/fiveW/WhenCard.tsx
git commit -m "refactor(WhenCard): remove makeRng, use zero matrix as loading fallback"
```

---

## Task 6: Remove makeRng from EventTimelineCard

**Files:**
- Modify: `src/components/fiveW/EventTimelineCard.tsx`

`fallbackData` generates fake cost bars for the spend curve. Replace with empty array and add a loading guard (the `buildCurve` call breaks on empty input).

- [ ] **Step 1: Remove makeRng import**

Remove line 4:
```typescript
import { makeRng } from '@/lib/rng';
```

- [ ] **Step 2: Remove fallbackData useMemo and replace the data derivation**

Remove the entire `fallbackData` useMemo block:
```typescript
const fallbackData = useMemo(() => {
  const rng = makeRng(44);
  return Array.from({ length: 30 }, (_, i) => {
    const base = 20 + rng() * 40;
    const spike = [14, 18].includes(i) ? rng() * 30 + 20 : 0;
    const drop = [3, 4, 5, 8, 9].includes(i) ? -(rng() * 15) : 0;
    return Math.max(8, base + spike + drop);
  });
}, []);
```

Change the `data` useMemo from:
```typescript
const data = useMemo<number[]>(() => {
  if (timelineData && timelineData.daily.length > 0) {
    return timelineData.daily.map(d => d.costUsd);
  }
  return fallbackData;
}, [timelineData, fallbackData]);
```
to:
```typescript
const data = useMemo<number[]>(() => {
  if (timelineData && timelineData.daily.length > 0) {
    return timelineData.daily.map(d => d.costUsd);
  }
  return [];
}, [timelineData]);
```

- [ ] **Step 3: Add empty-data loading guard**

After the `ANNOTATIONS` useMemo and before the `buildCurve` call, add:

```typescript
if (!data.length) return (
  <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
    <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
  </div>
);
```

- [ ] **Step 4: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/fiveW/EventTimelineCard.tsx
git commit -m "refactor(EventTimelineCard): remove makeRng, show loading state when no data"
```

---

## Task 7: Remove makeRng + MODELS from WhoCard

**Files:**
- Modify: `src/components/fiveW/WhoCard.tsx`

Three problems to fix:
1. `buildTrend` uses makeRng to generate per-model sparklines
2. `MODELS` is used as fallback when `modelData` is undefined
3. `costMul` from LOOKBACKS is incorrectly applied to live cost data (costs from tRPC already cover the lookback period — multiplying again double-counts time scaling)

- [ ] **Step 1: Replace import block**

Replace lines 5–6:
```typescript
import { makeRng } from '@/lib/rng';
import { MODELS, LOOKBACKS, Lookback, type Model } from '@/lib/models';
```
with:
```typescript
import { type Lookback } from '@/lib/lookback';
```

- [ ] **Step 2: Add local ModelRow type**

After the import block, add:
```typescript
interface ModelRow {
  id: string;
  name: string;
  vendor: string;
  share: number;
  tpm: number;
  p50: number;
  p95: number;
  cost: number;
  err: number;
  col: string;
}
```

- [ ] **Step 3: Remove buildTrend function**

Remove the entire `buildTrend` function:
```typescript
function buildTrend(modelId: string, n = 12): number[] {
  const r = makeRng(modelId.charCodeAt(0) * 7 + 3);
  return Array.from({ length: n }, () => 0.4 + r() * 0.6);
}
```

- [ ] **Step 4: Fix WhoCard function signature and body**

In the `WhoCard` export function, make these changes:

**Remove** `costMul` destructure (line ~39):
```typescript
const { costMul } = LOOKBACKS[lookback];
```

**Change** the `models` useMemo to use `ModelRow[]` and empty fallback:
```typescript
const models: ModelRow[] = useMemo(() => {
  const base = !modelData || modelData.length === 0
    ? []
    : modelData.map(m => ({
        id: m.model,
        name: m.model,
        vendor: m.provider,
        share: m.share / 100,
        tpm: m.calls,
        p50: m.avgLatMs,
        p95: m.p95LatMs,
        cost: m.cost,
        err: m.errorRatePct,
        col: modelColor(m.model),
      }));
  return providerFilter ? base.filter(m => m.vendor === providerFilter) : base;
}, [modelData, providerFilter]);
```

**Fix** the counterfactual simulation (remove `costMul`; live costs are already scoped to the lookback):
```typescript
const opusModel  = models.find(m => m.id.toLowerCase().includes('opus'))   ?? models[0];
const flashModel = models.find(m => m.id.toLowerCase().includes('sonnet')) ?? models[1];
const opusCost   = opusModel?.cost ?? 0;
const simCost    = (flashModel && opusModel && flashModel.tpm > 0)
  ? flashModel.cost * (opusModel.tpm / flashModel.tpm)
  : 0;
const savings    = opusCost - simCost;
```

**Replace** any `buildTrend(m.id)` call in the render (sparklines) with `[]`:
Find all occurrences of `buildTrend(...)` in the render JSX and replace each with `[]`.

- [ ] **Step 5: Add empty-data guard**

At the top of the WhoCard render return, before the card JSX, add:
```typescript
if (!models.length) return (
  <div className="card" style={{ padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
    <span style={{ fontSize: 12, color: 'var(--steel)' }}>Loading…</span>
  </div>
);
```

- [ ] **Step 6: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/fiveW/WhoCard.tsx
git commit -m "refactor(WhoCard): remove makeRng + MODELS, fix costMul double-count in sim"
```

---

## Task 8: Wire PulseBar to real pulseChart data

**Files:**
- Modify: `src/components/pulse/PulseBar.tsx`
- Modify: `src/app/page.tsx`

`PulseBar` currently accepts fake `tpmHist`, `latHist`, `tpmNow`, `latNow`, and `spikes` arrays from `page.tsx`. Move the tRPC queries inside PulseBar, remove those props, and detect spikes from the real data.

- [ ] **Step 1: Rewrite PulseBar Props interface**

Replace the current `Props` interface:
```typescript
interface Spike { i: number; }

interface Props {
  tpmHist: number[];
  latHist: number[];
  tpmNow: number;
  latNow: number;
  spikes: Spike[];
  onDrillSpike?: (s: Spike) => void;
  lookback: Lookback;
  setLookback: (l: Lookback) => void;
}
```
with:
```typescript
interface Spike { i: number; }

interface Props {
  onDrillSpike?: (s: Spike) => void;
  lookback: Lookback;
  setLookback: (l: Lookback) => void;
}
```

- [ ] **Step 2: Add tRPC import and internal queries**

Add to imports at the top of `PulseBar.tsx`:
```typescript
import { trpc } from '@/lib/trpc-client';
```

Inside the `PulseBar` function, replace all references to the removed props with derived data:
```typescript
export function PulseBar({ onDrillSpike, lookback, setLookback }: Props) {
  const { data: chartData } = trpc.pulse.pulseChart.useQuery({ lookback });
  const { data: statData }  = trpc.pulse.statStrip.useQuery({ lookback });

  const tpmHist: number[] = chartData?.map(r => r.tokens) ?? [];
  const latHist: number[] = chartData?.map(r => r.latP95) ?? [];
  const tpmNow = tpmHist[tpmHist.length - 1] ?? 0;
  const latNow = statData?.avgLatencyMs ?? 0;

  // Auto-detect spikes: buckets where latP95 > 2× median
  const sortedLat = [...latHist].sort((a, b) => a - b);
  const medianLat = sortedLat.length > 0 ? sortedLat[Math.floor(sortedLat.length / 2)] : 0;
  const spikes: Spike[] = latHist
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => medianLat > 0 && v > medianLat * 2)
    .map(({ i }) => ({ i }));

  // ... rest of component unchanged
```

- [ ] **Step 3: Update page.tsx — remove fake pulseData**

In `src/app/page.tsx`:

Remove the import on line 32:
```typescript
import { makeRng } from '@/lib/rng';
```

Remove the entire `pulseData` useMemo block (lines ~74–84):
```typescript
const pulseData = useMemo(() => {
  const r = makeRng(7);
  const tpm = Array.from({ length: 60 }, (_, i) => {
    const base = 14000 + Math.sin(i / 6) * 2500 + Math.sin(i / 2) * 900;
    return Math.max(4000, base + (r() - .5) * 3000);
  });
  const lat = Array.from({ length: 60 }, (_, i) =>
    420 + Math.sin(i / 9) * 120 + (r() - .5) * 200 + (i === 42 ? 1300 : 0) + (i === 51 ? 800 : 0) + (i === 18 ? 600 : 0)
  );
  return { tpm, lat, spikes: [{ i: 18 }, { i: 42 }, { i: 51 }] };
}, []);
```

Replace the `<PulseBar>` call (lines ~112–121):
```tsx
<PulseBar
  tpmHist={pulseData.tpm}
  latHist={pulseData.lat}
  tpmNow={43700}
  latNow={1078}
  spikes={pulseData.spikes}
  lookback={lookback}
  setLookback={setLookback}
  onDrillSpike={(s) => drillTo('spike', `pulse spike @ −${60 - s.i}m`, 4)}
/>
```
with:
```tsx
<PulseBar
  lookback={lookback}
  setLookback={setLookback}
  onDrillSpike={(s) => drillTo('spike', `pulse spike @ −${tpmHist.length - s.i}m`, 4)}
/>
```

Note: `tpmHist` is no longer available in page.tsx since it's internal to PulseBar. Simplify the drill message to a fixed string:
```tsx
onDrillSpike={(s) => drillTo('spike', `pulse spike`, 4)}
```

- [ ] **Step 4: TypeScript check**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/pulse/PulseBar.tsx src/app/page.tsx
git commit -m "feat(PulseBar): wire to real pulseChart + statStrip data, remove fake props"
```

---

## Task 9: Delete dead files

**Files:**
- Delete: `src/lib/rng.ts`
- Delete: `src/lib/models.ts`
- Delete: `src/app/login/page.tsx`
- Delete: `src/app/api/auth/route.ts`
- Delete: `src/middleware.ts`

By this point all consumers have been fixed (Tasks 1–8). Verify no remaining imports before deleting.

- [ ] **Step 1: Verify no remaining consumers**

```bash
cd /Users/micahbos/Desktop/cloud-router-ui/observatory/.claude/worktrees/condescending-lamport-20a14c
grep -r "from '@/lib/rng'" src/
grep -r "from '@/lib/models'" src/
```

Expected: no output. If anything is found, fix it before continuing.

- [ ] **Step 2: Delete the five files**

```bash
rm src/lib/rng.ts
rm src/lib/models.ts
rm src/app/login/page.tsx
rm src/app/api/auth/route.ts
rm src/middleware.ts
```

- [ ] **Step 3: Full build check**

```bash
npm run build 2>&1 | grep -E "error TS|Error:" | head -30
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 4: Run tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete dead files — rng, models, login, auth, middleware"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: LOOKBACKS alias
- ✅ Task 2: 10 import migrations
- ✅ Tasks 3–6: makeRng removed from 4 components
- ✅ Task 7: makeRng + MODELS removed from WhoCard, costMul bug fixed
- ✅ Task 8: PulseBar wired to real data
- ✅ Task 9: 5 dead files deleted

**Potential gaps:**
- `WhoCard` renders `<Sparkline data={[]} />` for each model — verify Sparkline handles empty array without throwing (check `src/components/shared/Sparkline.tsx` if it exists; if it renders an SVG path from empty data, add a guard there too).
- The `simOn` panel in WhoCard references `opusModel?.cost` — if `models` is empty, the panel won't show (guarded by `!models.length` return), so this is safe.

**Type consistency:** `ModelRow` is used consistently in Task 7. `Spike` interface is used in both old and new Props interface in Task 8.
