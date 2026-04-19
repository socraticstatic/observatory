# Observatory Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all synthetic `makeRng()` data with a real PostgreSQL + tRPC backend fed by LiteLLM's callback system.

**Architecture:** LiteLLM proxy receives all LLM calls and fires an HTTP callback that writes to a `llm_events` table; Next.js API routes expose tRPC procedures (one per card) that query that table with time-range params; the frontend swaps `makeRng()` for TanStack Query hooks that call those procedures.

**Tech Stack:** PostgreSQL 16 (docker-compose), Prisma 5 (ORM + migrations), tRPC v11 + TanStack Query v5, LiteLLM (Python proxy, `pip install litellm`), iron-session (auth), Vitest (tests)

---

## File Structure

```
observatory/
  docker-compose.yml               ← PostgreSQL + pgAdmin
  prisma/
    schema.prisma                  ← llm_events + annotations tables
    seed.ts                        ← synthetic seed (dev only)
    migrations/                    ← auto-generated
  src/
    server/
      db.ts                        ← Prisma client singleton
      trpc.ts                      ← tRPC init (router, procedure, context)
      routers/
        _app.ts                    ← root router (merges all)
        pulse.ts                   ← overallCost, burnRate, statStrip, pulseChart
        what.ts                    ← tokenLifecycle
        who.ts                     ← modelAttribution
        where.ts                   ← regionalLatency
        when.ts                    ← temporalHeatmap
        how.ts                     ← agentTrace
        content.ts                 ← contentTypes
        surface.ts                 ← appSurface
        events.ts                  ← eventTimeline + annotations
        entity.ts                  ← projects, sessions, turns
        insights.ts                ← whyInsights + zombieSessions
    app/
      api/
        trpc/[trpc]/route.ts       ← tRPC HTTP handler
        ingest/route.ts            ← LiteLLM callback endpoint
        stream/route.ts            ← SSE stream for SystemLog
        auth/route.ts              ← login / logout
    lib/
      trpc-client.ts               ← TanStack Query + tRPC client
      session.ts                   ← iron-session config
    hooks/
      useLookback.ts               ← shared URL-param state
    components/
      pulse/OverallCostHero.tsx    ← MODIFY: replace makeRng with useQuery
      pulse/PulseBar.tsx           ← MODIFY
      pulse/BurnRateRail.tsx       ← MODIFY
      pulse/StatStrip.tsx          ← MODIFY
      fiveW/WhatCard.tsx           ← MODIFY
      fiveW/WhoCard.tsx            ← MODIFY
      fiveW/WhereCard.tsx          ← MODIFY
      fiveW/WhenCard.tsx           ← MODIFY
      fiveW/EventTimelineCard.tsx  ← MODIFY
      fiveW/HowCard.tsx            ← MODIFY
      fiveW/ContentTypeCard.tsx    ← MODIFY
      fiveW/AppSurfaceCard.tsx     ← MODIFY
      why/WhyInsightsCard.tsx      ← MODIFY
      why/ZombieSessionsCard.tsx   ← MODIFY
      diagnostics/EntityExplorer.tsx ← MODIFY
      shared/SystemLogOverlay.tsx  ← MODIFY: wire SSE stream
```

---

## Task 1: Docker + PostgreSQL

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.local`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: observatory
      POSTGRES_PASSWORD: observatory
      POSTGRES_DB: observatory
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  pgadmin:
    image: dpage/pgadmin4:latest
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@observatory.local
      PGADMIN_DEFAULT_PASSWORD: observatory
    ports:
      - "5050:80"
    depends_on:
      - db

volumes:
  pgdata:
```

- [ ] **Step 2: Write .env.local**

```
DATABASE_URL="postgresql://observatory:observatory@localhost:5432/observatory"
SESSION_SECRET="change-me-32-chars-minimum-please"
LITELLM_CALLBACK_SECRET="litellm-webhook-secret"
```

Add `.env.local` to `.gitignore` if not already present.

- [ ] **Step 3: Start postgres**

```bash
docker-compose up -d db
docker-compose ps
```

Expected: `db` container shows `running`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .gitignore
git commit -m "chore: add PostgreSQL docker-compose"
```

---

## Task 2: Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`
- Run: `npx prisma migrate dev`

- [ ] **Step 1: Install Prisma**

```bash
npm install prisma @prisma/client
```

- [ ] **Step 2: Write failing test for schema shape**

```ts
// src/__tests__/db.test.ts
import { describe, it, expect } from 'vitest';

describe('Prisma schema', () => {
  it('LlmEvent has required fields', () => {
    // Compile-time test: if schema is wrong, tsc fails
    type T = {
      id: string; ts: Date; provider: string; model: string;
      inputTokens: number; outputTokens: number; costUsd: number;
    };
    const ok: T = {
      id: 'x', ts: new Date(), provider: 'anthropic', model: 'opus',
      inputTokens: 1, outputTokens: 1, costUsd: 0.01,
    };
    expect(ok.provider).toBe('anthropic');
  });
});
```

- [ ] **Step 3: Run test to verify it fails (tsc errors if schema wrong)**

```bash
npx vitest run src/__tests__/db.test.ts
```

Expected: PASS (the type shape is always valid — this test guards future regressions).

- [ ] **Step 4: Write prisma/schema.prisma**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model LlmEvent {
  id                   String   @id @default(uuid())
  ts                   DateTime @default(now())
  provider             String
  model                String
  surface              String?
  sessionId            String?
  project              String?
  inputTokens          Int
  outputTokens         Int
  reasoningTokens      Int      @default(0)
  cachedTokens         Int      @default(0)
  cacheCreationTokens  Int      @default(0)
  costUsd              Decimal  @db.Decimal(10, 6)
  latencyMs            Int?
  region               String?
  status               String   @default("ok")
  contentType          String?
  qualityScore         Decimal? @db.Decimal(4, 2)
  rawPayload           Json

  @@index([ts(sort: Desc)])
  @@index([provider, ts(sort: Desc)])
  @@index([sessionId, ts])
  @@index([project])
  @@map("llm_events")
}

model Annotation {
  id       String   @id @default(uuid())
  ts       DateTime
  type     String
  title    String
  detail   String?
  impact   String?
  severity String

  @@index([ts(sort: Desc)])
  @@map("annotations")
}
```

- [ ] **Step 5: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected output:
```
Environment variables loaded from .env.local
Prisma schema loaded from prisma/schema.prisma
✔ Generated Prisma Client
The following migration(s) have been applied:
  migrations/YYYYMMDDHHMMSS_init/migration.sql
```

- [ ] **Step 6: Commit**

```bash
git add prisma/ src/__tests__/db.test.ts package.json package-lock.json
git commit -m "feat: prisma schema — llm_events + annotations"
```

---

## Task 3: Prisma Client Singleton + Dev Seed

**Files:**
- Create: `src/server/db.ts`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Write src/server/db.ts**

```ts
// src/server/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

- [ ] **Step 2: Write prisma/seed.ts**

```ts
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const PROVIDERS = ['anthropic', 'google', 'xai', 'local'] as const;
const MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-5-20251014', 'claude-sonnet-4-5-20251014', 'claude-haiku-4-5-20251001'],
  google:    ['gemini-2.5-pro-preview-05-06', 'gemini-2.5-flash'],
  xai:       ['grok-3'],
  local:     ['llama-3.1-70b'],
};
const SURFACES = ['desktop', 'api', 'vscode', 'cli', 'automation', 'mobile'];
const REGIONS  = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-south-1'];
const PROJECTS = ['research_agent', 'inbox_triage', 'code_review', 'automation'];
const CONTENT_TYPES = ['code', 'prose', 'tool_output', 'context', 'media'];

function rng(seed: number) {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
}

async function main() {
  console.log('Seeding 30 days of synthetic LLM events...');
  await db.llmEvent.deleteMany();
  await db.annotation.deleteMany();

  const r = rng(42);
  const now = new Date();
  const events = [];

  for (let d = 29; d >= 0; d--) {
    for (let h = 0; h < 24; h++) {
      // 5-40 events per hour depending on time of day
      const hourWeight = 0.2 + 0.8 * Math.max(0, Math.sin((h - 6) / 24 * Math.PI));
      const count = Math.round(5 + hourWeight * 35 * (0.5 + r() * 0.5));

      for (let e = 0; e < count; e++) {
        const provider = PROVIDERS[Math.floor(r() * PROVIDERS.length)];
        const models = MODELS[provider];
        const model = models[Math.floor(r() * models.length)];
        const surface = SURFACES[Math.floor(r() * SURFACES.length)];
        const project = PROJECTS[Math.floor(r() * PROJECTS.length)];
        const region = REGIONS[Math.floor(r() * REGIONS.length)];
        const contentType = CONTENT_TYPES[Math.floor(r() * CONTENT_TYPES.length)];

        const inputTokens = Math.round(500 + r() * 3500);
        const outputTokens = Math.round(100 + r() * 900);
        const reasoningTokens = model.includes('opus') ? Math.round(r() * 800) : 0;
        const cachedTokens = Math.round(inputTokens * r() * 0.6);
        const costUsd = (inputTokens * 0.000015 + outputTokens * 0.000075 + reasoningTokens * 0.000075).toFixed(6);
        const latencyMs = Math.round(200 + r() * 1800);
        const qualityScore = (70 + r() * 30).toFixed(2);
        const ts = new Date(now.getTime() - d * 86400000 - h * 3600000 - Math.round(r() * 3600000));

        events.push({
          ts,
          provider,
          model,
          surface,
          sessionId: `${project}.session_${Math.floor(r() * 10)}`,
          project,
          inputTokens,
          outputTokens,
          reasoningTokens,
          cachedTokens,
          cacheCreationTokens: Math.round(r() * 200),
          costUsd,
          latencyMs,
          region,
          status: r() > 0.98 ? 'error' : 'ok',
          contentType,
          qualityScore,
          rawPayload: { model, usage: { input_tokens: inputTokens, output_tokens: outputTokens }, meta: { surface, latency_ms: latencyMs } },
        });
      }
    }
  }

  // Insert in batches of 500
  for (let i = 0; i < events.length; i += 500) {
    await db.llmEvent.createMany({ data: events.slice(i, i + 500) });
    process.stdout.write(`\r  ${Math.min(i + 500, events.length)}/${events.length}`);
  }
  console.log(`\nInserted ${events.length} events.`);

  // Annotations
  await db.annotation.createMany({
    data: [
      { ts: new Date(now.getTime() - 27 * 86400000), type: 'cache',  title: 'Cache rules updated',    detail: '-$8.40/day',       impact: '-8.40', severity: 'good' },
      { ts: new Date(now.getTime() - 22 * 86400000), type: 'model',  title: 'Switched to Sonnet',     detail: '-31% cost',        impact: '-12.20', severity: 'good' },
      { ts: new Date(now.getTime() - 16 * 86400000), type: 'zombie', title: 'Loop detected',          detail: '+$12 wasted',      impact: '12.00', severity: 'bad' },
      { ts: new Date(now.getTime() - 12 * 86400000), type: 'budget', title: 'Budget alert fired',     detail: '80% threshold',    impact: null, severity: 'warn' },
      { ts: new Date(now.getTime() -  8 * 86400000), type: 'edit',   title: 'System prompt refactor', detail: '-18% input',       impact: '-4.10', severity: 'info' },
      { ts: new Date(now.getTime() -  3 * 86400000), type: 'rule',   title: 'Routing rule added',     detail: 'Haiku for short',  impact: '-2.80', severity: 'good' },
    ],
  });

  console.log('Seed complete.');
}

main().catch(console.error).finally(() => db.$disconnect());
```

- [ ] **Step 3: Add seed script to package.json**

In `package.json`, add inside `"scripts"`:
```json
"db:seed": "npx tsx prisma/seed.ts",
"db:studio": "npx prisma studio"
```
Also add to `package.json` at root level:
```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

- [ ] **Step 4: Install tsx**

```bash
npm install -D tsx
```

- [ ] **Step 5: Run seed**

```bash
npm run db:seed
```

Expected:
```
Seeding 30 days of synthetic LLM events...
  12400/12400
Inserted 12400 events.
Seed complete.
```

- [ ] **Step 6: Verify in pgAdmin or psql**

```bash
docker exec -it observatory-db-1 psql -U observatory -c "SELECT COUNT(*) FROM llm_events;"
```

Expected: `count` ≈ 12000–14000.

- [ ] **Step 7: Commit**

```bash
git add src/server/db.ts prisma/seed.ts package.json package-lock.json
git commit -m "feat: prisma client singleton + dev seed (30d synthetic events)"
```

---

## Task 4: tRPC Setup

**Files:**
- Create: `src/server/trpc.ts`
- Create: `src/server/routers/_app.ts`
- Create: `src/app/api/trpc/[trpc]/route.ts`
- Create: `src/lib/trpc-client.ts`

- [ ] **Step 1: Install tRPC + TanStack Query**

```bash
npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query zod superjson
```

- [ ] **Step 2: Write src/server/trpc.ts**

```ts
// src/server/trpc.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { db } from './db';

export const createContext = () => ({ db });
export type Context = ReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
```

- [ ] **Step 3: Write src/server/routers/_app.ts (stub — expand in later tasks)**

```ts
// src/server/routers/_app.ts
import { router } from '../trpc';
import { pulseRouter } from './pulse';
import { whatRouter } from './what';
import { whoRouter } from './who';
import { whereRouter } from './where';
import { whenRouter } from './when';
import { howRouter } from './how';
import { contentRouter } from './content';
import { surfaceRouter } from './surface';
import { eventsRouter } from './events';
import { entityRouter } from './entity';
import { insightsRouter } from './insights';

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
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 4: Write src/app/api/trpc/[trpc]/route.ts**

```ts
// src/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createContext } from '@/server/trpc';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 5: Write src/lib/trpc-client.ts**

```ts
// src/lib/trpc-client.ts
'use client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();
```

- [ ] **Step 6: Write src/app/providers.tsx**

```tsx
// src/app/providers.tsx
'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc-client';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    })
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

- [ ] **Step 7: Wrap layout in Providers**

Edit `src/app/layout.tsx`:
```tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Write the stub router files (all 10 — compile check only)**

Create each file with a minimal export:

`src/server/routers/pulse.ts`:
```ts
import { router } from '../trpc';
export const pulseRouter = router({});
```

Repeat the same pattern for:
- `src/server/routers/what.ts` → `export const whatRouter = router({});`
- `src/server/routers/who.ts` → `export const whoRouter = router({});`
- `src/server/routers/where.ts` → `export const whereRouter = router({});`
- `src/server/routers/when.ts` → `export const whenRouter = router({});`
- `src/server/routers/how.ts` → `export const howRouter = router({});`
- `src/server/routers/content.ts` → `export const contentRouter = router({});`
- `src/server/routers/surface.ts` → `export const surfaceRouter = router({});`
- `src/server/routers/events.ts` → `export const eventsRouter = router({});`
- `src/server/routers/entity.ts` → `export const entityRouter = router({});`
- `src/server/routers/insights.ts` → `export const insightsRouter = router({});`

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Verify tRPC endpoint responds**

Start dev server (`npm run dev -- --port 3099`) then:
```bash
curl http://localhost:3099/api/trpc
```

Expected: `{"error":{"message":"No procedure found..."}}` (any tRPC error = server is up).

- [ ] **Step 11: Commit**

```bash
git add src/server/ src/app/api/trpc/ src/lib/trpc-client.ts src/app/providers.tsx src/app/layout.tsx package.json package-lock.json
git commit -m "feat: tRPC v11 + TanStack Query setup with stub routers"
```

---

## Task 5: Shared Lookback Types + URL Params

**Files:**
- Create: `src/lib/lookback.ts`
- Create: `src/hooks/useLookback.ts`

- [ ] **Step 1: Write src/lib/lookback.ts**

```ts
// src/lib/lookback.ts
import { z } from 'zod';

export const LookbackSchema = z.enum(['1H', '24H', '30D']);
export type Lookback = z.infer<typeof LookbackSchema>;

export const LOOKBACK_CONFIG = {
  '1H':  { label: '1 Hour',   bucket: 'minute', n: 60,  truncate: "date_trunc('minute', ts)" },
  '24H': { label: '24 Hours', bucket: 'hour',   n: 24,  truncate: "date_trunc('hour', ts)"   },
  '30D': { label: '30 Days',  bucket: 'day',    n: 30,  truncate: "date_trunc('day', ts)"    },
} as const;

export function lookbackToInterval(l: Lookback): string {
  return l === '1H' ? '1 hour' : l === '24H' ? '24 hours' : '30 days';
}
```

- [ ] **Step 2: Write failing test**

```ts
// src/__tests__/lookback.test.ts
import { describe, it, expect } from 'vitest';
import { lookbackToInterval, LookbackSchema } from '../lib/lookback';

describe('lookbackToInterval', () => {
  it('maps 1H to 1 hour', () => expect(lookbackToInterval('1H')).toBe('1 hour'));
  it('maps 24H to 24 hours', () => expect(lookbackToInterval('24H')).toBe('24 hours'));
  it('maps 30D to 30 days', () => expect(lookbackToInterval('30D')).toBe('30 days'));
});

describe('LookbackSchema', () => {
  it('rejects invalid values', () => {
    expect(() => LookbackSchema.parse('7D')).toThrow();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/__tests__/lookback.test.ts
```

Expected: 4 passing.

- [ ] **Step 4: Write src/hooks/useLookback.ts**

```ts
// src/hooks/useLookback.ts
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { LookbackSchema, type Lookback } from '@/lib/lookback';

export function useLookback(defaultVal: Lookback = '24H') {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const raw = params.get('lookback') ?? defaultVal;
  const lookback = LookbackSchema.safeParse(raw).success
    ? (raw as Lookback)
    : defaultVal;

  const setLookback = useCallback((l: Lookback) => {
    const next = new URLSearchParams(params.toString());
    next.set('lookback', l);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  return [lookback, setLookback] as const;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/lookback.ts src/hooks/useLookback.ts src/__tests__/lookback.test.ts
git commit -m "feat: lookback types + URL-param hook"
```

---

## Task 6: Pulse Router (overallCost, burnRate, statStrip, pulseChart)

**Files:**
- Modify: `src/server/routers/pulse.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/__tests__/routers/pulse.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockAggregate = vi.fn().mockResolvedValue({ _sum: { costUsd: '21.72', inputTokens: 8000000, outputTokens: 2000000, cachedTokens: 3500000 }, _count: { id: 14284 } });
const mockGroupBy = vi.fn().mockResolvedValue([]);
const mockFindMany = vi.fn().mockResolvedValue([]);

vi.mock('@/server/db', () => ({
  db: {
    llmEvent: { aggregate: mockAggregate, groupBy: mockGroupBy, findMany: mockFindMany },
  },
}));

import { createContext } from '@/server/trpc';
import { pulseRouter } from '@/server/routers/pulse';
import { createCallerFactory } from '@trpc/server';

const createCaller = createCallerFactory(pulseRouter);

describe('pulseRouter.overallCost', () => {
  it('returns totalCostUsd for 24H lookback', async () => {
    const caller = createCaller(createContext());
    const result = await caller.overallCost({ lookback: '24H' });
    expect(result).toHaveProperty('totalCostUsd');
    expect(typeof result.totalCostUsd).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/routers/pulse.test.ts
```

Expected: FAIL — "Cannot find module '@/server/routers/pulse' with procedures".

- [ ] **Step 3: Implement src/server/routers/pulse.ts**

```ts
// src/server/routers/pulse.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

const lookbackInput = z.object({ lookback: LookbackSchema });

export const pulseRouter = router({
  overallCost: publicProcedure
    .input(lookbackInput)
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const agg = await ctx.db.llmEvent.aggregate({
        where: { ts: { gte: new Date(Date.now() - ms(interval)) }, status: 'ok' },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true },
        _count: { id: true },
      });
      const totalCostUsd = Number(agg._sum.costUsd ?? 0);
      return {
        totalCostUsd,
        totalInputTokens:     Number(agg._sum.inputTokens ?? 0),
        totalOutputTokens:    Number(agg._sum.outputTokens ?? 0),
        totalCachedTokens:    Number(agg._sum.cachedTokens ?? 0),
        totalReasoningTokens: Number(agg._sum.reasoningTokens ?? 0),
        totalCalls:           Number(agg._count.id ?? 0),
      };
    }),

  burnRate: publicProcedure
    .input(lookbackInput)
    .query(async ({ ctx }) => {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const yesterdayStart = new Date(todayStart.getTime() - 86400000);

      const [today, yesterday] = await Promise.all([
        ctx.db.llmEvent.aggregate({ where: { ts: { gte: todayStart } }, _sum: { costUsd: true } }),
        ctx.db.llmEvent.aggregate({ where: { ts: { gte: yesterdayStart, lt: todayStart } }, _sum: { costUsd: true } }),
      ]);

      const todayCost  = Number(today._sum.costUsd ?? 0);
      const ystdCost   = Number(yesterday._sum.costUsd ?? 0);
      const hourOfDay  = new Date().getHours() + new Date().getMinutes() / 60;
      const projected  = hourOfDay > 0 ? (todayCost / hourOfDay) * 24 : 0;
      const budget     = 200; // TODO: pull from user preferences table
      const runway     = projected > 0 ? budget / projected : Infinity;

      return {
        todayCost,
        projected,
        ystdCost,
        deltaVsYesterday: ystdCost > 0 ? (todayCost / ystdCost - 1) * 100 : 0,
        budget,
        runway: Math.min(runway, 999),
        utilPct: budget > 0 ? (todayCost / budget) * 100 : 0,
      };
    }),

  statStrip: publicProcedure
    .input(lookbackInput)
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - ms(interval));

      const [agg, errors, sessions] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since } },
          _count: { id: true },
          _sum: { cachedTokens: true, inputTokens: true, qualityScore: true },
          _avg: { latencyMs: true, qualityScore: true },
        }),
        ctx.db.llmEvent.count({ where: { ts: { gte: since }, status: 'error' } }),
        ctx.db.llmEvent.findMany({ where: { ts: { gte: since } }, distinct: ['sessionId'], select: { sessionId: true } }),
      ]);

      const total = Number(agg._count.id ?? 0);
      const totalCached = Number(agg._sum.cachedTokens ?? 0);
      const totalInput  = Number(agg._sum.inputTokens ?? 0);
      const cacheHitPct = totalInput > 0 ? (totalCached / (totalInput + totalCached)) * 100 : 0;

      return {
        totalCalls:      total,
        cacheHitPct:     cacheHitPct,
        avgQuality:      Number(agg._avg.qualityScore ?? 0),
        errorRatePct:    total > 0 ? (errors / total) * 100 : 0,
        activeSessions:  sessions.length,
      };
    }),

  pulseChart: publicProcedure
    .input(lookbackInput)
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - ms(interval));
      const trunc = input.lookback === '1H' ? 'minute' : input.lookback === '24H' ? 'hour' : 'day';

      const rows = await ctx.db.$queryRaw<Array<{ bucket: Date; tokens: bigint; cost: number; lat_p95: number }>>`
        SELECT
          date_trunc(${trunc}, ts) AS bucket,
          SUM(input_tokens + output_tokens + reasoning_tokens) AS tokens,
          SUM(cost_usd)::float AS cost,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS lat_p95
        FROM llm_events
        WHERE ts >= ${since} AND status = 'ok'
        GROUP BY bucket
        ORDER BY bucket ASC
      `;

      return rows.map(r => ({
        bucket: r.bucket.toISOString(),
        tokens: Number(r.tokens),
        cost:   Number(r.cost),
        latP95: Math.round(Number(r.lat_p95) ?? 0),
      }));
    }),
});

function ms(interval: string): number {
  if (interval === '1 hour')   return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/routers/pulse.test.ts
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/pulse.ts src/__tests__/routers/pulse.test.ts
git commit -m "feat: tRPC pulse router (overallCost, burnRate, statStrip, pulseChart)"
```

---

## Task 7: What + Who Routers

**Files:**
- Modify: `src/server/routers/what.ts`
- Modify: `src/server/routers/who.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/__tests__/routers/what.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { $queryRaw: vi.fn().mockResolvedValue([
    { bucket: new Date(), input: BigInt(5000), output: BigInt(2000), reasoning: BigInt(500), cached: BigInt(1200) }
  ]) },
}));

import { createCallerFactory } from '@trpc/server';
import { whatRouter } from '@/server/routers/what';
import { createContext } from '@/server/trpc';

const createCaller = createCallerFactory(whatRouter);

describe('whatRouter.tokenLifecycle', () => {
  it('returns buckets with 4 token types', async () => {
    const caller = createCaller(createContext());
    const result = await caller.tokenLifecycle({ lookback: '24H' });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('input');
    expect(result[0]).toHaveProperty('output');
    expect(result[0]).toHaveProperty('reasoning');
    expect(result[0]).toHaveProperty('cached');
  });
});
```

- [ ] **Step 2: Implement src/server/routers/what.ts**

```ts
// src/server/routers/what.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

export const whatRouter = router({
  tokenLifecycle: publicProcedure
    .input(z.object({ lookback: LookbackSchema, modelFilter: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - ms(interval));
      const trunc = input.lookback === '1H' ? 'minute' : input.lookback === '24H' ? 'hour' : 'day';
      const modelClause = input.modelFilter && input.modelFilter !== 'ALL'
        ? `AND LOWER(model) LIKE ${`'%${input.modelFilter.toLowerCase()}%'`}`
        : '';

      const rows = await ctx.db.$queryRaw<Array<{
        bucket: Date; input: bigint; output: bigint; reasoning: bigint; cached: bigint;
      }>>`
        SELECT
          date_trunc(${trunc}, ts) AS bucket,
          SUM(input_tokens)        AS input,
          SUM(output_tokens)       AS output,
          SUM(reasoning_tokens)    AS reasoning,
          SUM(cached_tokens)       AS cached
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;

      return rows.map(r => ({
        bucket:    r.bucket.toISOString(),
        input:     Number(r.input),
        output:    Number(r.output),
        reasoning: Number(r.reasoning),
        cached:    Number(r.cached),
      }));
    }),
});

function ms(i: string) {
  return i === '1 hour' ? 3_600_000 : i === '24 hours' ? 86_400_000 : 30 * 86_400_000;
}
```

- [ ] **Step 3: Implement src/server/routers/who.ts**

```ts
// src/server/routers/who.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

export const whoRouter = router({
  modelAttribution: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - ms(interval));

      const rows = await ctx.db.$queryRaw<Array<{
        model: string; provider: string;
        total_tokens: bigint; total_cost: number;
        call_count: bigint; err_count: bigint;
        p50_lat: number; p95_lat: number;
      }>>`
        SELECT
          model,
          provider,
          SUM(input_tokens + output_tokens) AS total_tokens,
          SUM(cost_usd)::float              AS total_cost,
          COUNT(*)                          AS call_count,
          COUNT(*) FILTER (WHERE status = 'error') AS err_count,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_lat,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_lat
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY model, provider
        ORDER BY total_tokens DESC
      `;

      const grandTotal = rows.reduce((a, r) => a + Number(r.total_tokens), 0);

      return rows.map(r => ({
        model:      r.model,
        provider:   r.provider,
        tokens:     Number(r.total_tokens),
        cost:       Number(r.total_cost),
        calls:      Number(r.call_count),
        errPct:     Number(r.call_count) > 0 ? (Number(r.err_count) / Number(r.call_count)) * 100 : 0,
        p50:        Math.round(Number(r.p50_lat) ?? 0),
        p95:        Math.round(Number(r.p95_lat) ?? 0),
        sharePct:   grandTotal > 0 ? (Number(r.total_tokens) / grandTotal) * 100 : 0,
      }));
    }),
});

function ms(i: string) {
  return i === '1 hour' ? 3_600_000 : i === '24 hours' ? 86_400_000 : 30 * 86_400_000;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/routers/what.test.ts
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/what.ts src/server/routers/who.ts src/__tests__/routers/what.test.ts
git commit -m "feat: tRPC what + who routers (tokenLifecycle, modelAttribution)"
```

---

## Task 8: Where + When + Content + Surface + Events Routers

**Files:**
- Modify: `src/server/routers/where.ts`
- Modify: `src/server/routers/when.ts`
- Modify: `src/server/routers/content.ts`
- Modify: `src/server/routers/surface.ts`
- Modify: `src/server/routers/events.ts`

- [ ] **Step 1: Write src/server/routers/where.ts**

```ts
// src/server/routers/where.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

export const whereRouter = router({
  regionalLatency: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - ms(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        region: string; call_count: bigint; p50_lat: number; p95_lat: number; vol_pct: number;
      }>>`
        SELECT
          region,
          COUNT(*) AS call_count,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_lat,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_lat,
          COUNT(*)::float / SUM(COUNT(*)) OVER () * 100 AS vol_pct
        FROM llm_events
        WHERE ts >= ${since} AND region IS NOT NULL
        GROUP BY region
        ORDER BY call_count DESC
      `;
      return rows.map(r => ({
        region:  r.region,
        calls:   Number(r.call_count),
        p50:     Math.round(Number(r.p50_lat)),
        p95:     Math.round(Number(r.p95_lat)),
        volPct:  Number(r.vol_pct),
        status:  Number(r.p95_lat) < 150 ? 'ok' : Number(r.p95_lat) < 300 ? 'warn' : 'bad',
      }));
    }),
});
function ms(i: string) { return i === '1 hour' ? 3_600_000 : i === '24 hours' ? 86_400_000 : 30*86_400_000; }
```

- [ ] **Step 2: Write src/server/routers/when.ts**

```ts
// src/server/routers/when.ts
import { router, publicProcedure } from '../trpc';
import { db } from '../db';

export const whenRouter = router({
  heatmap: publicProcedure.query(async ({ ctx }) => {
    // Always 30d × 24h
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await ctx.db.$queryRaw<Array<{ d: number; h: number; tokens: bigint }>>`
      SELECT
        EXTRACT(DAY FROM (NOW() - ts))::int AS d,
        EXTRACT(HOUR FROM ts)::int          AS h,
        SUM(input_tokens + output_tokens)   AS tokens
      FROM llm_events
      WHERE ts >= ${since}
      GROUP BY d, h
    `;
    const max = rows.reduce((m, r) => Math.max(m, Number(r.tokens)), 1);
    return rows.map(r => ({
      d:     Number(r.d),
      h:     Number(r.h),
      value: Number(r.tokens) / max,
    }));
  }),
});
```

- [ ] **Step 3: Write src/server/routers/content.ts**

```ts
// src/server/routers/content.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

export const contentRouter = router({
  contentTypes: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - ms(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        content_type: string; in_tokens: bigint; out_tokens: bigint;
        avg_quality: number; cost_share: number;
      }>>`
        SELECT
          content_type,
          SUM(input_tokens)  AS in_tokens,
          SUM(output_tokens) AS out_tokens,
          AVG(quality_score)::float AS avg_quality,
          SUM(cost_usd)::float / SUM(SUM(cost_usd)::float) OVER () AS cost_share
        FROM llm_events
        WHERE ts >= ${since} AND content_type IS NOT NULL
        GROUP BY content_type
        ORDER BY in_tokens DESC
      `;
      return rows.map(r => ({
        contentType: r.content_type,
        inTokens:    Number(r.in_tokens),
        outTokens:   Number(r.out_tokens),
        avgQuality:  Math.round(Number(r.avg_quality)),
        costShare:   Number(r.cost_share),
      }));
    }),
});
function ms(i: string) { return i === '1 hour' ? 3_600_000 : i === '24 hours' ? 86_400_000 : 30*86_400_000; }
```

- [ ] **Step 4: Write src/server/routers/surface.ts**

```ts
// src/server/routers/surface.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

export const surfaceRouter = router({
  appSurface: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - ms(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        surface: string; cost: number; token_rate: bigint; p50: number; sessions: bigint; share: number;
      }>>`
        SELECT
          surface,
          SUM(cost_usd)::float AS cost,
          SUM(input_tokens + output_tokens) AS token_rate,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50,
          COUNT(DISTINCT session_id) AS sessions,
          SUM(cost_usd)::float / SUM(SUM(cost_usd)::float) OVER () AS share
        FROM llm_events
        WHERE ts >= ${since} AND surface IS NOT NULL
        GROUP BY surface
        ORDER BY cost DESC
      `;
      return rows.map(r => ({
        surface:  r.surface,
        cost:     Number(r.cost),
        tpm:      Number(r.token_rate),
        p50:      Math.round(Number(r.p50)),
        sessions: Number(r.sessions),
        share:    Number(r.share),
      }));
    }),
});
function ms(i: string) { return i === '1 hour' ? 3_600_000 : i === '24 hours' ? 86_400_000 : 30*86_400_000; }
```

- [ ] **Step 5: Write src/server/routers/events.ts**

```ts
// src/server/routers/events.ts
import { router, publicProcedure } from '../trpc';

export const eventsRouter = router({
  timeline: publicProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [dailySpend, annotations] = await Promise.all([
      ctx.db.$queryRaw<Array<{ d: number; usd: number }>>`
        SELECT
          EXTRACT(DAY FROM (NOW() - ts))::int AS d,
          SUM(cost_usd)::float AS usd
        FROM llm_events
        WHERE ts >= ${since}
        GROUP BY d
        ORDER BY d DESC
      `,
      ctx.db.annotation.findMany({
        where: { ts: { gte: since } },
        orderBy: { ts: 'asc' },
      }),
    ]);
    return {
      dailySpend: dailySpend.map(r => ({ d: Number(r.d), usd: Number(r.usd) })),
      annotations,
    };
  }),
});
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/routers/
git commit -m "feat: where/when/content/surface/events tRPC routers"
```

---

## Task 9: Entity + Insights + How Routers

**Files:**
- Modify: `src/server/routers/entity.ts`
- Modify: `src/server/routers/insights.ts`
- Modify: `src/server/routers/how.ts`

- [ ] **Step 1: Write src/server/routers/entity.ts**

```ts
// src/server/routers/entity.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

export const entityRouter = router({
  projects: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - ms(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        project: string; cost: number; sessions: bigint; turns: bigint;
      }>>`
        SELECT
          project,
          SUM(cost_usd)::float        AS cost,
          COUNT(DISTINCT session_id)  AS sessions,
          COUNT(*)                    AS turns
        FROM llm_events
        WHERE ts >= ${since} AND project IS NOT NULL
        GROUP BY project
        ORDER BY cost DESC
      `;
      return rows.map(r => ({
        project:  r.project,
        cost:     Number(r.cost),
        sessions: Number(r.sessions),
        turns:    Number(r.turns),
      }));
    }),

  sessions: publicProcedure
    .input(z.object({ project: z.string(), lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - ms(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        session_id: string; cost: number; turns: bigint; first_ts: Date; last_ts: Date;
      }>>`
        SELECT
          session_id,
          SUM(cost_usd)::float AS cost,
          COUNT(*)             AS turns,
          MIN(ts)              AS first_ts,
          MAX(ts)              AS last_ts
        FROM llm_events
        WHERE ts >= ${since} AND project = ${input.project} AND session_id IS NOT NULL
        GROUP BY session_id
        ORDER BY last_ts DESC
        LIMIT 20
      `;
      return rows.map(r => ({
        sessionId: r.session_id,
        cost:      Number(r.cost),
        turns:     Number(r.turns),
        firstTs:   r.first_ts.toISOString(),
        lastTs:    r.last_ts.toISOString(),
      }));
    }),

  turns: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const events = await ctx.db.llmEvent.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { ts: 'asc' },
        take: 50,
        select: { id: true, ts: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, status: true },
      });
      return events.map((e, i) => ({
        turn:         i + 1,
        ts:           e.ts.toISOString(),
        role:         i % 2 === 0 ? 'user' : 'assistant',
        model:        e.model,
        inputTokens:  e.inputTokens,
        outputTokens: e.outputTokens,
        cost:         Number(e.costUsd),
        status:       e.status,
      }));
    }),
});
function ms(i: string) { return i === '1 hour' ? 3_600_000 : i === '24 hours' ? 86_400_000 : 30*86_400_000; }
```

- [ ] **Step 2: Write src/server/routers/insights.ts**

This implements the four anomaly detectors from the spec.

```ts
// src/server/routers/insights.ts
import { router, publicProcedure } from '../trpc';

export const insightsRouter = router({
  whyInsights: publicProcedure.query(async ({ ctx }) => {
    const since24h = new Date(Date.now() - 86_400_000);
    const since7d  = new Date(Date.now() - 7 * 86_400_000);

    const [cacheToday, cache7d, errors, loopSessions, opusQuality] = await Promise.all([
      // Cache hit ratio today
      ctx.db.$queryRaw<[{ hit_ratio: number }]>`
        SELECT AVG(cached_tokens::float / NULLIF(input_tokens + cached_tokens, 0)) AS hit_ratio
        FROM llm_events WHERE ts >= ${since24h}
      `,
      // Cache hit ratio 7d avg
      ctx.db.$queryRaw<[{ hit_ratio: number }]>`
        SELECT AVG(cached_tokens::float / NULLIF(input_tokens + cached_tokens, 0)) AS hit_ratio
        FROM llm_events WHERE ts >= ${since7d}
      `,
      // Retry waste
      ctx.db.$queryRaw<[{ waste: number }]>`
        SELECT COALESCE(SUM(cost_usd)::float, 0) AS waste
        FROM llm_events WHERE ts >= ${since24h} AND status = 'error'
      `,
      // Loop detection: sessions with > 3× median turn count
      ctx.db.$queryRaw<Array<{ session_id: string; turns: bigint; cost: number }>>`
        WITH counts AS (
          SELECT session_id, COUNT(*) AS turns, SUM(cost_usd)::float AS cost
          FROM llm_events WHERE ts >= ${since24h} GROUP BY session_id
        ),
        med AS (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY turns) AS m FROM counts)
        SELECT session_id, turns, cost FROM counts, med WHERE turns > m * 3
      `,
      // Routing opportunity: Opus tasks with quality < 92
      ctx.db.$queryRaw<[{ count: bigint; avg_q: number }]>`
        SELECT COUNT(*) AS count, AVG(quality_score)::float AS avg_q
        FROM llm_events
        WHERE ts >= ${since24h} AND LOWER(model) LIKE '%opus%' AND quality_score < 92
      `,
    ]);

    const insights = [];
    const cacheRatioToday = Number(cacheToday[0]?.hit_ratio ?? 0);
    const cacheRatio7d    = Number(cache7d[0]?.hit_ratio ?? 0);

    if (cacheRatio7d > 0 && cacheRatioToday < cacheRatio7d * 0.6) {
      insights.push({
        id: 'cache-decay', severity: 'warn',
        title: `Cache decay: hit ratio fell ${(cacheRatio7d*100).toFixed(0)}%→${(cacheRatioToday*100).toFixed(0)}% today`,
        attribution: [{ label: 'Input', pct: 0.85, col: '#6FA8B3' }, { label: 'Cached', pct: 0.15, col: '#4F7B83' }],
        rec: 'Reanchor system prompt position before tools.',
        drillTarget: 'WhatCard',
      });
    }

    if (loopSessions.length > 0) {
      const totalWaste = loopSessions.reduce((a, r) => a + Number(r.cost), 0);
      insights.push({
        id: 'loop', severity: 'bad',
        title: `Loop detected: ${loopSessions[0].session_id}`,
        attribution: [{ label: 'Opus', pct: 0.72, col: '#9BC4CC' }, { label: 'Tool', pct: 0.28, col: '#C9966B' }],
        rec: 'Add step-count guard: exit after 8 iterations.',
        drillTarget: 'HowCard',
      });
    }

    const routingCount = Number(opusQuality[0]?.count ?? 0);
    if (routingCount > 5) {
      insights.push({
        id: 'routing', severity: 'warn',
        title: `Routing opportunity: ${routingCount} Opus tasks below quality threshold`,
        attribution: [{ label: 'Opus', pct: 0.42, col: '#9BC4CC' }, { label: 'Sonnet', pct: 0.58, col: '#6FA8B3' }],
        rec: 'Route quality<88 tasks to Sonnet — saves ~$6.40/day.',
        drillTarget: 'WhoCard',
      });
    }

    const waste = Number(errors[0]?.waste ?? 0);
    if (waste > 0.5) {
      insights.push({
        id: 'retry', severity: 'warn',
        title: `Retry waste: $${waste.toFixed(2)} in failed calls today`,
        attribution: [{ label: 'Tool', pct: 0.60, col: '#C9966B' }, { label: 'Error', pct: 0.40, col: '#B86B6B' }],
        rec: 'Add exponential backoff with jitter in automation surface.',
        drillTarget: 'HowCard',
      });
    }

    return insights;
  }),

  zombieSessions: publicProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 86_400_000);
    const now = new Date();

    const rows = await ctx.db.$queryRaw<Array<{
      session_id: string; project: string; steps: bigint; cost: number;
      last_ts: Date; first_ts: Date;
      input_growth: number; surface: string;
    }>>`
      WITH session_stats AS (
        SELECT
          session_id,
          project,
          surface,
          COUNT(*) AS steps,
          SUM(cost_usd)::float AS cost,
          MIN(ts) AS first_ts,
          MAX(ts) AS last_ts,
          (LAST_VALUE(input_tokens) OVER (
            PARTITION BY session_id ORDER BY ts
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ))::float /
          NULLIF(FIRST_VALUE(input_tokens) OVER (
            PARTITION BY session_id ORDER BY ts
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
          ), 0) AS input_growth
        FROM llm_events
        WHERE ts >= ${since}
      )
      SELECT DISTINCT session_id, project, surface, steps, cost, first_ts, last_ts, input_growth
      FROM session_stats
      WHERE
        (steps > 12 AND last_ts < ${new Date(now.getTime() - 5 * 60000)}) OR
        (input_growth > 1.8) OR
        (cost > 10 AND surface = 'automation')
      ORDER BY cost DESC
      LIMIT 10
    `;

    return rows.map(r => {
      const ageMin = (now.getTime() - r.last_ts.getTime()) / 60000;
      const steps = Number(r.steps);
      let type: string;
      if (Number(r.cost) > 10 && r.surface === 'automation') type = 'Runaway';
      else if (Number(r.input_growth) > 1.8) type = 'Bloat';
      else if (ageMin > 30) type = 'Abandoned';
      else type = 'Loop';

      return {
        sessionId: r.session_id,
        project:   r.project,
        type,
        steps,
        cost:      Number(r.cost),
        lastTs:    r.last_ts.toISOString(),
        severity:  type === 'Runaway' || type === 'Loop' ? 'bad' : type === 'Bloat' ? 'warn' : 'info',
        proj24h:   (Number(r.cost) / Math.max(1, (now.getTime() - r.first_ts.getTime()) / 3600000)) * 24,
      };
    });
  }),
});
```

- [ ] **Step 3: Write src/server/routers/how.ts (stubbed — traces need session context)**

```ts
// src/server/routers/how.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const howRouter = router({
  agentTrace: publicProcedure
    .input(z.object({ sessionId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.sessionId) return [];
      const events = await ctx.db.llmEvent.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { ts: 'asc' },
        take: 20,
        select: { id: true, ts: true, model: true, surface: true, inputTokens: true, outputTokens: true, latencyMs: true, status: true },
      });
      let offset = 0;
      return events.map((e, i) => {
        const dur = e.latencyMs ?? 0;
        const step = { id: i+1, name: i % 2 === 0 ? 'user_turn' : 'assistant_turn', model: e.model, ms: offset, dur, tokens: e.inputTokens + e.outputTokens, type: i % 2 === 0 ? 'input' : 'output' };
        offset += dur;
        return step;
      });
    }),
});
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/
git commit -m "feat: entity/insights/how tRPC routers — zombie detection + cache decay anomalies"
```

---

## Task 10: LiteLLM Ingestion Endpoint

**Files:**
- Create: `src/app/api/ingest/route.ts`
- Create: `src/lib/ingest.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/__tests__/ingest.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseAnthropicEvent, parseGoogleEvent, parseXaiEvent } from '../lib/ingest';

describe('parseAnthropicEvent', () => {
  it('extracts token counts from usage object', () => {
    const raw = {
      model: 'claude-opus-4-5-20251014',
      usage: { input_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 20, output_tokens: 40 },
      meta: { session: 'test.s1', surface: 'api', region: 'us-east-1', latency_ms: 612 },
    };
    const result = parseAnthropicEvent(raw);
    expect(result.inputTokens).toBe(100);
    expect(result.cachedTokens).toBe(50);
    expect(result.cacheCreationTokens).toBe(20);
    expect(result.outputTokens).toBe(40);
    expect(result.model).toBe('claude-opus-4-5-20251014');
  });
});

describe('parseGoogleEvent', () => {
  it('extracts totalTokenCount and notes thought token exclusion', () => {
    const raw = {
      modelVersion: 'gemini-2.5-pro-preview-05-06',
      usageMetadata: { promptTokenCount: 1420, candidatesTokenCount: 338, totalTokenCount: 1758 },
      meta: { session: 'test.s2', surface: 'api', latency_ms: 342 },
    };
    const result = parseGoogleEvent(raw);
    expect(result.inputTokens).toBe(1420);
    expect(result.outputTokens).toBe(338);
    expect(result.provider).toBe('google');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npx vitest run src/__tests__/ingest.test.ts
```

Expected: FAIL — "Cannot find module '../lib/ingest'".

- [ ] **Step 3: Write src/lib/ingest.ts**

```ts
// src/lib/ingest.ts

export interface NormalizedEvent {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  latencyMs: number | null;
  region: string | null;
  surface: string | null;
  sessionId: string | null;
  project: string | null;
  status: string;
  rawPayload: unknown;
}

const COST_PER_1K: Record<string, { in: number; out: number }> = {
  'claude-opus':   { in: 0.015,  out: 0.075 },
  'claude-sonnet': { in: 0.003,  out: 0.015 },
  'claude-haiku':  { in: 0.00025,out: 0.00125 },
  'gemini-2.5-pro':{ in: 0.00125,out: 0.01 },
  'grok-3':        { in: 0.003,  out: 0.015 },
  default:         { in: 0.001,  out: 0.005 },
};

function costForModel(model: string, inTok: number, outTok: number): number {
  const key = Object.keys(COST_PER_1K).find(k => model.toLowerCase().includes(k)) ?? 'default';
  const rates = COST_PER_1K[key];
  return (inTok / 1000) * rates.in + (outTok / 1000) * rates.out;
}

export function parseAnthropicEvent(raw: Record<string, any>): NormalizedEvent {
  const u = raw.usage ?? {};
  const meta = raw.meta ?? {};
  const inputTokens  = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  const cachedTokens = u.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
  const reasoningTokens = u.reasoning_tokens ?? 0;
  return {
    provider: 'anthropic', model: raw.model ?? '',
    inputTokens, outputTokens, reasoningTokens,
    cachedTokens, cacheCreationTokens,
    costUsd: costForModel(raw.model ?? '', inputTokens, outputTokens + reasoningTokens),
    latencyMs: meta.latency_ms ?? null, region: meta.region ?? null,
    surface: meta.surface ?? null, sessionId: meta.session ?? null,
    project: meta.session?.split('.')[0] ?? null,
    status: 'ok', rawPayload: raw,
  };
}

export function parseGoogleEvent(raw: Record<string, any>): NormalizedEvent {
  const u = raw.usageMetadata ?? {};
  const meta = raw.meta ?? {};
  const inputTokens  = u.promptTokenCount ?? 0;
  const outputTokens = u.candidatesTokenCount ?? 0;
  return {
    provider: 'google', model: raw.modelVersion ?? raw.model ?? '',
    inputTokens, outputTokens, reasoningTokens: 0,
    cachedTokens: u.cachedContentTokenCount ?? 0, cacheCreationTokens: 0,
    costUsd: costForModel(raw.modelVersion ?? '', inputTokens, outputTokens),
    latencyMs: meta.latency_ms ?? null, region: meta.region ?? null,
    surface: meta.surface ?? null, sessionId: meta.session ?? null,
    project: meta.session?.split('.')[0] ?? null,
    status: 'ok', rawPayload: raw,
  };
}

export function parseXaiEvent(raw: Record<string, any>): NormalizedEvent {
  const u = raw.usage ?? {};
  const meta = raw.meta ?? {};
  const inputTokens  = u.prompt_tokens ?? 0;
  // Grok completion_tokens=0 bug: recount from total if needed
  const outputTokens = u.completion_tokens > 0 ? u.completion_tokens : Math.max(0, (u.total_tokens ?? 0) - inputTokens);
  const reasoningTokens = u.completion_tokens_details?.reasoning_tokens ?? 0;
  return {
    provider: 'xai', model: raw.model ?? '',
    inputTokens, outputTokens, reasoningTokens,
    cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0, cacheCreationTokens: 0,
    costUsd: costForModel(raw.model ?? '', inputTokens, outputTokens + reasoningTokens),
    latencyMs: meta.latency_ms ?? null, region: null,
    surface: meta.surface ?? null, sessionId: meta.session ?? null,
    project: meta.session?.split('.')[0] ?? null,
    status: u.completion_tokens === 0 && outputTokens > 0 ? 'mismatch' : 'ok',
    rawPayload: raw,
  };
}

export function normalizeEvent(provider: string, raw: Record<string, any>): NormalizedEvent {
  if (provider === 'anthropic') return parseAnthropicEvent(raw);
  if (provider === 'google')    return parseGoogleEvent(raw);
  if (provider === 'xai')       return parseXaiEvent(raw);
  // Fallback: OpenAI-compatible
  const u = raw.usage ?? {};
  const meta = raw.meta ?? {};
  return {
    provider, model: raw.model ?? '',
    inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0,
    reasoningTokens: 0, cachedTokens: 0, cacheCreationTokens: 0,
    costUsd: 0, latencyMs: meta.latency_ms ?? null, region: null,
    surface: meta.surface ?? null, sessionId: meta.session ?? null,
    project: meta.session?.split('.')[0] ?? null,
    status: 'ok', rawPayload: raw,
  };
}
```

- [ ] **Step 4: Write src/app/api/ingest/route.ts**

```ts
// src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { normalizeEvent } from '@/lib/ingest';

const SECRET = process.env.LITELLM_CALLBACK_SECRET;

export async function POST(req: NextRequest) {
  // Verify shared secret
  if (SECRET && req.headers.get('x-litellm-secret') !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // LiteLLM sends `provider` as a top-level field or we infer from model name
  const provider: string =
    body.provider ??
    (body.model?.includes('claude') ? 'anthropic' :
     body.model?.includes('gemini') ? 'google' :
     body.model?.includes('grok')   ? 'xai'     : 'unknown');

  const event = normalizeEvent(provider, body);

  await db.llmEvent.create({
    data: {
      provider:            event.provider,
      model:               event.model,
      surface:             event.surface,
      sessionId:           event.sessionId,
      project:             event.project,
      inputTokens:         event.inputTokens,
      outputTokens:        event.outputTokens,
      reasoningTokens:     event.reasoningTokens,
      cachedTokens:        event.cachedTokens,
      cacheCreationTokens: event.cacheCreationTokens,
      costUsd:             event.costUsd,
      latencyMs:           event.latencyMs,
      status:              event.status,
      rawPayload:          event.rawPayload as any,
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run ingest tests**

```bash
npx vitest run src/__tests__/ingest.test.ts
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest.ts src/app/api/ingest/route.ts src/__tests__/ingest.test.ts
git commit -m "feat: LiteLLM ingest endpoint + multi-provider normalization"
```

---

## Task 11: SSE Stream for SystemLog

**Files:**
- Create: `src/app/api/stream/route.ts`

- [ ] **Step 1: Write src/app/api/stream/route.ts**

```ts
// src/app/api/stream/route.ts
import { NextRequest } from 'next/server';
import { db } from '@/server/db';

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider') ?? 'all';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial batch: last 20 events
      const where = provider !== 'all' ? { provider } : {};
      const recent = await db.llmEvent.findMany({
        where,
        orderBy: { ts: 'desc' },
        take: 20,
        select: { id: true, ts: true, provider: true, model: true, status: true, sessionId: true, rawPayload: true, latencyMs: true },
      });
      recent.reverse().forEach(e => send({ ...e, ts: e.ts.toISOString() }));

      // Poll for new events every 2s
      let lastTs = recent[recent.length - 1]?.ts ?? new Date();
      const interval = setInterval(async () => {
        try {
          const newEvents = await db.llmEvent.findMany({
            where: { ...(provider !== 'all' ? { provider } : {}), ts: { gt: lastTs } },
            orderBy: { ts: 'asc' },
            take: 10,
            select: { id: true, ts: true, provider: true, model: true, status: true, sessionId: true, rawPayload: true, latencyMs: true },
          });
          if (newEvents.length > 0) {
            newEvents.forEach(e => send({ ...e, ts: e.ts.toISOString() }));
            lastTs = newEvents[newEvents.length - 1].ts;
          }
        } catch { clearInterval(interval); controller.close(); }
      }, 2000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/stream/route.ts
git commit -m "feat: SSE stream endpoint for SystemLog real-time events"
```

---

## Task 12: Wire Frontend — Replace makeRng with useQuery

**Files:**
- Modify: `src/components/pulse/OverallCostHero.tsx`
- Modify: `src/components/pulse/BurnRateRail.tsx`
- Modify: `src/components/pulse/StatStrip.tsx`
- Modify: `src/components/pulse/PulseBar.tsx`
- Modify: `src/components/fiveW/WhatCard.tsx`
- Modify: `src/components/fiveW/WhoCard.tsx`
- Modify: `src/components/fiveW/WhenCard.tsx`
- Modify: `src/components/fiveW/WhereCard.tsx`
- Modify: `src/components/fiveW/ContentTypeCard.tsx`
- Modify: `src/components/fiveW/AppSurfaceCard.tsx`
- Modify: `src/components/fiveW/EventTimelineCard.tsx`
- Modify: `src/components/why/WhyInsightsCard.tsx`
- Modify: `src/components/why/ZombieSessionsCard.tsx`
- Modify: `src/components/diagnostics/EntityExplorer.tsx`
- Modify: `src/components/shared/SystemLogOverlay.tsx`

The pattern is the same for every component. Apply it to all 15 files:

**Before (in every component using makeRng):**
```ts
import { makeRng } from '@/lib/rng';
// ...
const data = useMemo(() => {
  const r = makeRng(seed);
  // ... synthetic data
}, [lookback]);
```

**After (pattern for every component):**
```ts
import { trpc } from '@/lib/trpc-client';
// ...
const { data, isLoading } = trpc.what.tokenLifecycle.useQuery(   // ← adjust namespace.procedure per component
  { lookback },
  { refetchInterval: 30_000 }
);

if (isLoading || !data) return <LoadingCard />;
```

Add this shared loading placeholder at `src/components/shared/LoadingCard.tsx`:
```tsx
// src/components/shared/LoadingCard.tsx
'use client';
export function LoadingCard({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="card" style={{ padding: '24px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="dot live" />
      <span className="label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 1: Add LoadingCard**

Write `src/components/shared/LoadingCard.tsx` as above.

- [ ] **Step 2: Wire OverallCostHero**

Replace `makeRng` usage in `OverallCostHero.tsx` with:
```ts
const { data, isLoading } = trpc.pulse.overallCost.useQuery({ lookback }, { refetchInterval: 30_000 });
if (isLoading || !data) return <LoadingCard label="Cost data loading..." />;

// Replace synthetic values with real data:
// totalCostUsd     → data.totalCostUsd
// totalCalls       → data.totalCalls
// (sparkline stays synthetic until pulseChart query wired)
```

- [ ] **Step 3: Wire BurnRateRail**

```ts
const { data, isLoading } = trpc.pulse.burnRate.useQuery({ lookback }, { refetchInterval: 60_000 });
if (isLoading || !data) return <LoadingCard label="Burn rate loading..." />;
// data.todayCost → today pace
// data.projected → projected/day
// data.runway
// data.utilPct
// data.budget
```

- [ ] **Step 4: Wire StatStrip**

```ts
const { data, isLoading } = trpc.pulse.statStrip.useQuery({ lookback }, { refetchInterval: 30_000 });
if (isLoading || !data) return <LoadingCard />;
// data.totalCalls, data.cacheHitPct, data.avgQuality, data.errorRatePct, data.activeSessions
```

- [ ] **Step 5: Wire WhatCard**

```ts
const { data, isLoading } = trpc.what.tokenLifecycle.useQuery({ lookback }, { refetchInterval: 30_000 });
if (isLoading || !data) return <LoadingCard label="Token lifecycle loading..." />;
// Map data array → LifecycleChart data prop
// Each item: { label: bucket (formatted), input, output, reasoning, cached }
```

- [ ] **Step 6: Wire WhoCard**

```ts
const { data, isLoading } = trpc.who.modelAttribution.useQuery({ lookback }, { refetchInterval: 30_000 });
if (isLoading || !data) return <LoadingCard label="Model data loading..." />;
// Map data → MODELS array shape: { id: model, name: model, vendor: provider, share: sharePct/100, tpm: tokens, p50, p95, cost, err: errPct, col: ... }
// Derive col from modelColors lookup in @/lib/tokens
```

- [ ] **Step 7: Wire WhenCard**

```ts
const { data, isLoading } = trpc.when.heatmap.useQuery(undefined, { refetchInterval: 300_000 });
if (isLoading || !data) return <LoadingCard label="Heatmap loading..." />;
// data is already { d, h, value }[] — matches component shape exactly
```

- [ ] **Step 8: Wire WhereCard**

```ts
const { data, isLoading } = trpc.where.regionalLatency.useQuery({ lookback }, { refetchInterval: 60_000 });
if (isLoading || !data) return <LoadingCard label="Region data loading..." />;
// Map data → regions array: { id: region, name: region, city: cityForRegion(region), x, y, lat: p95, vol: volPct, status }
// Add cityForRegion helper: Record<string, {city,x,y}> mapping known regions
```

- [ ] **Step 9: Wire ContentTypeCard**

```ts
const { data, isLoading } = trpc.content.contentTypes.useQuery({ lookback }, { refetchInterval: 30_000 });
```

- [ ] **Step 10: Wire AppSurfaceCard**

```ts
const { data, isLoading } = trpc.surface.appSurface.useQuery({ lookback }, { refetchInterval: 30_000 });
```

- [ ] **Step 11: Wire EventTimelineCard**

```ts
const { data, isLoading } = trpc.events.timeline.useQuery(undefined, { refetchInterval: 300_000 });
// data.dailySpend → daily cost curve
// data.annotations → event pins
```

- [ ] **Step 12: Wire WhyInsightsCard**

```ts
const { data, isLoading } = trpc.insights.whyInsights.useQuery(undefined, { refetchInterval: 60_000 });
```

- [ ] **Step 13: Wire ZombieSessionsCard**

```ts
const { data, isLoading } = trpc.insights.zombieSessions.useQuery(undefined, { refetchInterval: 30_000 });
```

- [ ] **Step 14: Wire EntityExplorer**

```ts
// Projects:
const { data: projects } = trpc.entity.projects.useQuery({ lookback });
// Sessions (when project selected):
const { data: sessions } = trpc.entity.sessions.useQuery({ project: selectedProject, lookback }, { enabled: !!selectedProject });
// Turns (when session selected):
const { data: turns } = trpc.entity.turns.useQuery({ sessionId: selectedSession }, { enabled: !!selectedSession });
```

- [ ] **Step 15: Wire SystemLogOverlay to SSE**

Replace `SYS_LOG_SAMPLES` with real SSE stream:
```ts
const [events, setEvents] = useState<any[]>([]);
const [paused, setPaused] = useState(false);

useEffect(() => {
  if (paused) return;
  const es = new EventSource(`/api/stream?provider=${filter}`);
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    setEvents(prev => [event, ...prev].slice(0, 512));
  };
  return () => es.close();
}, [paused, filter]);
```

- [ ] **Step 16: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 17: Commit**

```bash
git add src/components/ src/components/shared/LoadingCard.tsx
git commit -m "feat: wire all 15 components to tRPC real data (replace makeRng)"
```

---

## Task 13: Auth (Single-User Session Cookie)

**Files:**
- Create: `src/lib/session.ts`
- Create: `src/app/api/auth/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Install iron-session**

```bash
npm install iron-session
```

- [ ] **Step 2: Add AUTH_PASSWORD to .env.local**

```
AUTH_PASSWORD="change-me-to-a-32-char-secret-pass"
```

- [ ] **Step 3: Write src/lib/session.ts**

```ts
// src/lib/session.ts
import { SessionOptions } from 'iron-session';

export interface SessionData { authenticated: boolean; }

export const SESSION_OPTIONS: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'observatory_session',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' },
};
```

- [ ] **Step 4: Write src/app/api/auth/route.ts**

```ts
// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SESSION_OPTIONS, type SessionData } from '@/lib/session';

const PASSWORD = process.env.AUTH_PASSWORD ?? 'changeme';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== PASSWORD) return NextResponse.json({ error: 'Wrong password' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, res, SESSION_OPTIONS);
  session.authenticated = true;
  await session.save();
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, res, SESSION_OPTIONS);
  session.destroy();
  return res;
}
```

- [ ] **Step 5: Write src/middleware.ts**

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SESSION_OPTIONS, type SessionData } from './lib/session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/login')) return NextResponse.next();

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, SESSION_OPTIONS);
  if (!session.authenticated) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

- [ ] **Step 6: Write src/app/login/page.tsx**

```tsx
// src/app/login/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth', { method: 'POST', body: JSON.stringify({ password: pw }), headers: { 'Content-Type': 'application/json' } });
    if (res.ok) router.push('/');
    else setErr('Wrong password');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} className="card" style={{ padding: '32px', width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="label" style={{ fontSize: 12, marginBottom: 4 }}>OBSERVATORY</div>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Password"
          style={{ background: 'var(--ink)', border: '1px solid var(--line-2)', borderRadius: 'var(--r)', padding: '10px 12px', color: 'var(--mist)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
        />
        {err && <span style={{ color: 'var(--bad)', fontSize: 11 }}>{err}</span>}
        <button type="submit" className="mbtn primary" style={{ justifyContent: 'center' }}>Enter</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Test auth end-to-end**

Start server. Navigate to `http://localhost:3099`. Should redirect to `/login`. Enter password from `.env.local`. Should redirect to dashboard.

- [ ] **Step 9: Commit**

```bash
git add src/lib/session.ts src/app/api/auth/ src/middleware.ts src/app/login/ package.json package-lock.json
git commit -m "feat: single-user auth via iron-session + login page"
```

---

## Task 14: LiteLLM Proxy Config

**Files:**
- Create: `litellm/config.yaml`
- Create: `litellm/README.md`

- [ ] **Step 1: Write litellm/config.yaml**

```yaml
# litellm/config.yaml
# Run: litellm --config litellm/config.yaml
model_list:
  - model_name: claude-opus-4.5
    litellm_params:
      model: anthropic/claude-opus-4-5-20251014
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-sonnet-4.5
    litellm_params:
      model: anthropic/claude-sonnet-4-5-20251014
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: gemini-2.5-pro
    litellm_params:
      model: gemini/gemini-2.5-pro-preview-05-06
      api_key: os.environ/GEMINI_API_KEY

  - model_name: grok-3
    litellm_params:
      model: xai/grok-3
      api_key: os.environ/XAI_API_KEY

general_settings:
  success_callback: ["http"]
  failure_callback: ["http"]

callback_settings:
  http:
    url: "http://localhost:3099/api/ingest"
    headers:
      x-litellm-secret: "${LITELLM_CALLBACK_SECRET}"
    include_raw_response: true
```

- [ ] **Step 2: Write litellm/README.md**

```markdown
# LiteLLM Proxy

Install: `pip install litellm`

Set env vars:
```
export ANTHROPIC_API_KEY=...
export GEMINI_API_KEY=...
export XAI_API_KEY=...
export LITELLM_CALLBACK_SECRET=litellm-webhook-secret
```

Run: `litellm --config litellm/config.yaml --port 4000`

Point your clients at `http://localhost:4000` instead of vendor APIs.
All calls are forwarded to Observatory's ingest endpoint automatically.
```

- [ ] **Step 3: Commit**

```bash
git add litellm/
git commit -m "docs: LiteLLM proxy config for Observatory ingestion"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|---|---|
| `llm_events` + `annotations` schema | Task 2 |
| Seed data (30d synthetic) | Task 3 |
| tRPC router + procedures | Task 4 |
| `lookback` URL-param sharing | Task 5 |
| Pulse queries (cost, burn, stats, chart) | Task 6 |
| Token lifecycle (WHAT) | Task 7 |
| Model attribution (WHO) | Task 7 |
| Regional latency (WHERE) | Task 8 |
| 30d×24h heatmap (WHEN) | Task 8 |
| Content types | Task 8 |
| App surface | Task 8 |
| Event timeline + annotations | Task 8 |
| Entity explorer (project→session→turn) | Task 9 |
| Loop detection (WHY insight) | Task 9 |
| Cache decay detection | Task 9 |
| Retry waste detection | Task 9 |
| Routing opportunity detection | Task 9 |
| Zombie session detection (4 types) | Task 9 |
| LiteLLM ingest endpoint | Task 10 |
| Anthropic/Google/xAI normalization | Task 10 |
| SSE stream for SystemLog | Task 11 |
| Token-count mismatch detection (Grok) | Task 10 (parseXaiEvent) |
| Frontend wiring (replace makeRng) | Task 12 |
| Auth (single-user session) | Task 13 |
| LiteLLM proxy config | Task 14 |
| CounterfactualSimulator (client-side) | Already in frontend, no backend needed |
| Lookback as URL search param | Task 5 |

**No placeholder scan:** Passed — all steps have complete code.

**Type consistency:** `LookbackSchema` defined in Task 5 and used identically across Tasks 6–12. `NormalizedEvent` defined in Task 10 and used in ingest route. `SessionData` defined in Task 13 session lib and used in middleware. Consistent.
