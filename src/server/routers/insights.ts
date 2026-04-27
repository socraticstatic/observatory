import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema } from '@/lib/lookback';

const LOOKBACK_MS: Record<string, number> = {
  '1H': 3_600_000, '24H': 86_400_000,
  '30D': 30 * 86_400_000, '90D': 90 * 86_400_000, '1Y': 365 * 86_400_000,
};

const providerInput = z.object({ provider: z.string().optional() }).optional();

export const insightsRouter = router({
  whyInsights: publicProcedure
    .input(z.object({ provider: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const since7d = new Date(Date.now() - 7 * 86_400_000);
      const since1d = new Date(Date.now() - 86_400_000);
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      // Cache decay detector — use aggregate ratio (not per-event average) to avoid small-event bias
      const [cacheToday, cache7d] = await Promise.all([
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT SUM("cachedTokens")::float / NULLIF(SUM("inputTokens" + "cachedTokens"), 0) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since1d} ${pfSql}
        `,
        ctx.db.$queryRaw<Array<{ hit_ratio: unknown }>>`
          SELECT SUM("cachedTokens")::float / NULLIF(SUM("inputTokens" + "cachedTokens"), 0) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since7d} AND ts < ${since1d} ${pfSql}
        `,
      ]);

      const todayHit = Number(cacheToday[0]?.hit_ratio ?? 0);
      const weekHit  = Number(cache7d[0]?.hit_ratio ?? 0);
      const cacheDecay = weekHit > 0 && todayHit < weekHit * 0.6;

      // Routing opportunity: opus projects spending > $2 in last 7d (Sonnet likely sufficient)
      const routingRows = await ctx.db.$queryRaw<Array<{ project: string; cost: unknown }>>`
        SELECT project, SUM("costUsd")::float AS cost
        FROM llm_events
        WHERE ts >= ${since7d} AND model LIKE '%opus%' ${pfSql}
        GROUP BY project
        HAVING SUM("costUsd") > 2.00
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
          detail: `$${Number(row.cost).toFixed(2)} Opus spend in 7d — Sonnet may suffice`,
          recommendation: `Switch ${row.project} to Sonnet. Est. saving: ~60%.`,
        });
      }
      return insights;
    }),

  sessionAnomalies: publicProcedure
    .query(async ({ ctx }) => {
      const since1h = new Date(Date.now() - 3_600_000);

      const [events, bucketRows] = await Promise.all([
        ctx.db.llmEvent.findMany({
          where: { ts: { gte: since1h } },
          orderBy: { ts: 'desc' },
          take: 100,
          select: {
            id: true, ts: true, model: true, project: true,
            sessionId: true, costUsd: true, inputTokens: true,
            outputTokens: true, cachedTokens: true, status: true,
          },
        }),
        ctx.db.$queryRaw<Array<{ bucket: unknown; total_tokens: unknown }>>`
          SELECT
            FLOOR(EXTRACT(EPOCH FROM (NOW() - ts)) / 60)::int AS bucket,
            SUM("inputTokens" + "outputTokens") AS total_tokens
          FROM llm_events
          WHERE ts >= ${since1h}
          GROUP BY 1
          ORDER BY 1 ASC
        `,
      ]);

      const bucketMap = new Map<number, number>();
      for (const b of bucketRows) {
        bucketMap.set(Number(b.bucket), Number(b.total_tokens));
      }

      const maxTokens = Math.max(1, ...bucketMap.values());

      const mapped = events.map(e => {
        const cost = Number(e.costUsd);
        const isError   = e.status === 'error';
        const isCostHigh = cost > 0.10;
        const isSpike    = e.outputTokens > 8000;
        const isCached   = e.cachedTokens > 0;
        const tag = isError ? 'STATUS.ERROR' : isCostHigh ? 'COST.SPIKE' : isSpike ? 'OUTPUT.SPIKE' : isCached ? 'CACHE.HIT' : 'INFERENCE.OK';
        const lvl: 'ok' | 'warn' | 'bad' = isError ? 'bad' : (isCostHigh || isSpike) ? 'warn' : 'ok';
        const t = new Date(e.ts);
        const ts = t.toTimeString().slice(0, 8);
        const msg = isError
          ? `error · ${e.model ?? 'unknown'}`
          : isCostHigh
            ? `$${cost.toFixed(4)} · ${e.model ?? 'unknown'} · ${e.project ?? 'unknown'}`
            : isSpike
              ? `${e.outputTokens.toLocaleString()} out tokens · ${e.model ?? 'unknown'}`
              : isCached
                ? `${e.cachedTokens.toLocaleString()} cached · ${e.model ?? 'unknown'}`
                : `${(e.inputTokens + e.outputTokens).toLocaleString()} tokens · ${e.model ?? 'unknown'}`;
        return { id: e.id, t: ts, lvl, tag, msg, src: e.project ?? 'unknown', span: e.sessionId ? '#' + e.sessionId.slice(0, 6) : '' };
      });

      const errorCount   = mapped.filter(e => e.lvl === 'bad').length;
      const warnCount    = mapped.filter(e => e.lvl === 'warn').length;
      const riskScore    = Math.min(100, Math.round((errorCount * 10 + warnCount * 3) / Math.max(1, mapped.length) * 100));

      // Index 0 = oldest (59 min ago), index 59 = most recent — matches "←60m → now" axis
      const tokenBuckets = Array.from({ length: 60 }, (_, i) => ({
        sev: Math.min(1, (bucketMap.get(59 - i) ?? 0) / maxTokens),
      }));

      return {
        events: mapped,
        riskScore,
        tokenBuckets,
        counts: {
          errors:  mapped.filter(e => e.tag === 'STATUS.ERROR').length,
          costHigh: mapped.filter(e => e.tag === 'COST.SPIKE').length,
          spikes:  mapped.filter(e => e.tag === 'OUTPUT.SPIKE').length,
          cacheHits: mapped.filter(e => e.tag === 'CACHE.HIT').length,
        },
      };
    }),

  journeySnapshot: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since  = new Date(Date.now() - (LOOKBACK_MS[input.lookback] ?? 86_400_000));
      const pfSql  = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const [composition, latency, outcome, routing] = await Promise.all([
        ctx.db.$queryRaw<[{ cached: number; cache_creation: number; fresh_input: number; output_tokens: number }]>`
          SELECT
            COALESCE(SUM("cachedTokens"),           0)::float AS cached,
            COALESCE(SUM("cacheCreationTokens"),     0)::float AS cache_creation,
            COALESCE(SUM("inputTokens"),             0)::float AS fresh_input,
            COALESCE(SUM("outputTokens"),            0)::float AS output_tokens
          FROM llm_events WHERE ts >= ${since} ${pfSql}
        `,
        ctx.db.$queryRaw<[{ p50: number; p95: number }]>`
          SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float AS p50,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95
          FROM llm_events WHERE ts >= ${since} AND "latencyMs" IS NOT NULL ${pfSql}
        `,
        ctx.db.$queryRaw<[{ total: bigint; errors: bigint; total_cost: number }]>`
          SELECT
            COUNT(*)::bigint                                          AS total,
            COUNT(CASE WHEN status = 'error' THEN 1 END)::bigint     AS errors,
            COALESCE(SUM("costUsd"), 0)::float                       AS total_cost
          FROM llm_events WHERE ts >= ${since} ${pfSql}
        `,
        ctx.db.$queryRaw<Array<{ tier: string; cost: number; calls: bigint }>>`
          SELECT
            CASE
              WHEN model ILIKE '%opus%'   THEN 'Opus'
              WHEN model ILIKE '%sonnet%' THEN 'Sonnet'
              WHEN model ILIKE '%haiku%'  THEN 'Haiku'
              WHEN model ILIKE '%gpt-4%'  THEN 'GPT-4'
              WHEN model ILIKE '%gemini%' THEN 'Gemini'
              ELSE 'Other'
            END AS tier,
            COALESCE(SUM("costUsd"), 0)::float AS cost,
            COUNT(*)::bigint                   AS calls
          FROM llm_events WHERE ts >= ${since} ${pfSql}
          GROUP BY 1 ORDER BY cost DESC
        `,
      ]);

      const comp       = composition[0] ?? { cached: 0, cache_creation: 0, fresh_input: 0, output_tokens: 0 };
      const totalInput = comp.cached + comp.cache_creation + comp.fresh_input;
      const totalTok   = totalInput + comp.output_tokens;
      const cachePct   = totalInput > 0 ? comp.cached / totalInput * 100 : 0;

      const lat      = latency[0] ?? { p50: 0, p95: 0 };
      const latRatio = lat.p50 > 0 ? lat.p95 / lat.p50 : 0;

      const out        = outcome[0] ?? { total: BigInt(0), errors: BigInt(0), total_cost: 0 };
      const totalCalls = Number(out.total);
      const errorPct   = totalCalls > 0 ? Number(out.errors) / totalCalls * 100 : 0;

      const totalCost = routing.reduce((s, r) => s + r.cost, 0);
      const opusPct   = totalCost > 0 ? (routing.find(r => r.tier === 'Opus')?.cost ?? 0) / totalCost * 100 : 0;

      return {
        composition: {
          verdict:   cachePct > 40 ? 'ok' : cachePct > 20 ? 'watch' : 'act',
          cachedPct: Math.round(cachePct),
          freshPct:  Math.round(totalInput > 0 ? comp.fresh_input / totalInput * 100 : 0),
          writePct:  Math.round(totalInput > 0 ? comp.cache_creation / totalInput * 100 : 0),
          totalTokens: Math.round(totalTok),
        },
        routing: {
          verdict:  opusPct > 60 ? 'watch' : 'ok',
          tiers:    routing.map(r => ({
            name:  r.tier,
            pct:   Math.round(totalCost > 0 ? r.cost / totalCost * 100 : 0),
            calls: Number(r.calls),
          })),
          opusPct: Math.round(opusPct),
        },
        processing: {
          verdict:  latRatio > 7 ? 'act' : latRatio > 3 ? 'watch' : 'ok',
          p50Ms:    Math.round(lat.p50),
          p95Ms:    Math.round(lat.p95),
          latRatio: Math.round(latRatio * 10) / 10,
        },
        outcome: {
          verdict:     errorPct > 10 ? 'act' : errorPct > 3 ? 'watch' : 'ok',
          okPct:       Math.round(100 - errorPct),
          errorPct:    Math.round(errorPct * 10) / 10,
          totalCalls,
          totalCostUsd: Number(out.total_cost),
        },
      };
    }),

  findings: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since   = new Date(Date.now() - (LOOKBACK_MS[input.lookback] ?? 86_400_000));
      const since1d = new Date(Date.now() - 86_400_000);
      const since7d = new Date(Date.now() - 7 * 86_400_000);
      const pfSql   = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const pfFilter = input.provider ? { provider: input.provider } : {};

      const [
        opusMismatch, tailLat, reasoning, sprawl,
        whaleRows, cacheWR, errBurst, cache1d, cache7d, totalCostAgg,
      ] = await Promise.all([
        ctx.db.$queryRaw<[{ count: bigint; wasted_cost: number }]>`
          SELECT COUNT(*)::bigint AS count,
            COALESCE(SUM("costUsd" * 0.8), 0)::float AS wasted_cost
          FROM llm_events
          WHERE ts >= ${since} AND model ILIKE '%opus%'
            AND "outputTokens" > 0 AND "outputTokens" < 500 ${pfSql}
        `,
        ctx.db.$queryRaw<[{ p50: number; p95: number }]>`
          SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float AS p50,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95
          FROM llm_events WHERE ts >= ${since} AND "latencyMs" IS NOT NULL ${pfSql}
        `,
        ctx.db.$queryRaw<[{ count: bigint; total_cost: number }]>`
          SELECT COUNT(*)::bigint AS count,
            COALESCE(SUM("costUsd"), 0)::float AS total_cost
          FROM llm_events
          WHERE ts >= ${since} AND "reasoningTokens" > "outputTokens"
            AND "reasoningTokens" > 0 ${pfSql}
        `,
        ctx.db.$queryRaw<[{ single_count: bigint; total_count: bigint }]>`
          SELECT
            COUNT(CASE WHEN call_count = 1 THEN 1 END)::bigint AS single_count,
            COUNT(*)::bigint                                    AS total_count
          FROM (
            SELECT "sessionId", COUNT(*) AS call_count
            FROM llm_events
            WHERE ts >= ${since} AND "sessionId" IS NOT NULL ${pfSql}
            GROUP BY "sessionId"
          ) s
        `,
        ctx.db.$queryRaw<Array<{ session_cost: number }>>`
          SELECT COALESCE(SUM("costUsd"), 0)::float AS session_cost
          FROM llm_events
          WHERE ts >= ${since} AND "sessionId" IS NOT NULL ${pfSql}
          GROUP BY "sessionId"
          ORDER BY session_cost DESC LIMIT 5
        `,
        ctx.db.$queryRaw<[{ cache_writes: number; cache_reads: number; write_cost: number }]>`
          SELECT
            COALESCE(SUM("cacheCreationTokens"), 0)::float AS cache_writes,
            COALESCE(SUM("cachedTokens"),         0)::float AS cache_reads,
            COALESCE(SUM(
              CASE
                WHEN model ILIKE '%claude-opus%'   THEN "cacheCreationTokens"::numeric * 0.00001875
                WHEN model ILIKE '%claude-haiku%'  THEN "cacheCreationTokens"::numeric * 0.000001
                WHEN model ILIKE '%claude-sonnet%' THEN "cacheCreationTokens"::numeric * 0.00000375
                ELSE                                    "cacheCreationTokens"::numeric * 0.00000375
              END
            ), 0)::float AS write_cost
          FROM llm_events WHERE ts >= ${since} ${pfSql}
        `,
        ctx.db.$queryRaw<[{ max_error_rate: number }]>`
          SELECT COALESCE(MAX(error_rate), 0) AS max_error_rate FROM (
            SELECT
              COUNT(CASE WHEN status = 'error' THEN 1 END)::float / COUNT(*) * 100 AS error_rate
            FROM llm_events WHERE ts >= ${since} ${pfSql}
            GROUP BY date_trunc('hour', ts)
            HAVING COUNT(*) >= 5
          ) h
        `,
        ctx.db.$queryRaw<[{ hit_ratio: number }]>`
          SELECT SUM("cachedTokens")::float / NULLIF(SUM("inputTokens" + "cachedTokens"), 0) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since1d} ${pfSql}
        `,
        ctx.db.$queryRaw<[{ hit_ratio: number }]>`
          SELECT SUM("cachedTokens")::float / NULLIF(SUM("inputTokens" + "cachedTokens"), 0) * 100 AS hit_ratio
          FROM llm_events WHERE ts >= ${since7d} AND ts < ${since1d} ${pfSql}
        `,
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since }, sessionId: { not: null }, ...pfFilter },
          _sum: { costUsd: true },
        }),
      ]);

      type Sev  = 'act' | 'warn' | 'info';
      type Cat  = 'cost' | 'latency' | 'efficiency' | 'reliability';
      type Conf = 'high' | 'medium' | 'low';
      const findings: Array<{
        id: string; category: Cat; severity: Sev;
        title: string; detail: string; impact: string; action: string; confidence: Conf;
      }> = [];

      const mismatchCount = Number(opusMismatch[0]?.count ?? 0);
      const wastedCost    = Number(opusMismatch[0]?.wasted_cost ?? 0);
      if (mismatchCount > 10) {
        findings.push({
          id: 'opus-mismatch', category: 'cost',
          severity:   wastedCost > 10 ? 'act' : 'warn',
          title:      'Opus handling short responses',
          detail:     `${mismatchCount.toLocaleString()} calls returned fewer than 500 tokens via Opus. Sonnet handles these at ~20% of the cost.`,
          impact:     wastedCost > 0.01 ? `~$${wastedCost.toFixed(2)} potential savings` : 'minimal cost impact',
          action:     'Route short-output calls to claude-sonnet or claude-haiku',
          confidence: 'high',
        });
      }

      const p50 = Number(tailLat[0]?.p50 ?? 0);
      const p95 = Number(tailLat[0]?.p95 ?? 0);
      const ratio = p50 > 0 ? p95 / p50 : 0;
      if (ratio > 3 && p95 > 2000) {
        findings.push({
          id: 'tail-latency', category: 'latency',
          severity:   ratio > 7 ? 'act' : 'warn',
          title:      'Tail latency spike',
          detail:     `p95 ${(p95 / 1000).toFixed(1)}s vs p50 ${(p50 / 1000).toFixed(1)}s — ${Math.round(ratio)}× median. A small number of calls are pulling the tail.`,
          impact:     `${Math.round(ratio)}× latency variance degrades perceived reliability`,
          action:     'Filter Sessions by high latency to identify outlier calls',
          confidence: 'high',
        });
      }

      const reasoningCount = Number(reasoning[0]?.count ?? 0);
      const reasoningCost  = Number(reasoning[0]?.total_cost ?? 0);
      if (reasoningCount > 20) {
        findings.push({
          id: 'reasoning-overkill', category: 'cost',
          severity:   'warn',
          title:      'Extended thinking exceeds output',
          detail:     `${reasoningCount.toLocaleString()} calls where reasoning tokens outnumber output tokens. Extended thinking may be active for tasks that don't need it.`,
          impact:     reasoningCost > 0.01 ? `$${reasoningCost.toFixed(2)} in reasoning-heavy calls` : 'low cost impact',
          action:     'Disable extended thinking for conversational or low-complexity call paths',
          confidence: 'medium',
        });
      }

      const singleCount   = Number(sprawl[0]?.single_count ?? 0);
      const totalSessions = Number(sprawl[0]?.total_count ?? 0);
      const sprawlPct     = totalSessions > 0 ? singleCount / totalSessions * 100 : 0;
      if (sprawlPct > 70 && totalSessions > 50) {
        findings.push({
          id: 'session-sprawl', category: 'efficiency',
          severity:   'info',
          title:      'High single-call session rate',
          detail:     `${Math.round(sprawlPct)}% of sessions contain exactly one call (${singleCount.toLocaleString()} of ${totalSessions.toLocaleString()}). Context is never reused within sessions.`,
          impact:     'Cache warming overhead on every call — no context reuse benefit',
          action:     'Group related calls into longer sessions to enable context caching',
          confidence: 'medium',
        });
      }

      if (whaleRows.length >= 3) {
        const topCost  = whaleRows.reduce((s, r) => s + Number(r.session_cost), 0);
        const total    = Number(totalCostAgg._sum.costUsd ?? 0);
        const whalePct = total > 0 ? topCost / total * 100 : 0;
        if (whalePct > 60) {
          findings.push({
            id: 'cost-whales', category: 'cost',
            severity:   'warn',
            title:      'Cost concentrated in top sessions',
            detail:     `Top ${whaleRows.length} sessions account for ${Math.round(whalePct)}% of total cost. A small number of sessions are dominating spend.`,
            impact:     `$${topCost.toFixed(2)} concentrated in ${whaleRows.length} sessions`,
            action:     'Review top sessions — check for runaway loops or oversized contexts',
            confidence: 'high',
          });
        }
      }

      const cacheWrites = Number(cacheWR[0]?.cache_writes ?? 0);
      const cacheReads  = Number(cacheWR[0]?.cache_reads ?? 0);
      const writeCost   = Number(cacheWR[0]?.write_cost ?? 0);
      if (cacheWrites > 100_000 && cacheReads < cacheWrites * 0.3) {
        findings.push({
          id: 'cache-write-no-read', category: 'efficiency',
          severity:   'warn',
          title:      'Cache writes not being read',
          detail:     `${(cacheWrites / 1_000_000).toFixed(1)}M tokens written to cache, only ${(cacheReads / 1_000_000).toFixed(1)}M read back (${Math.round(cacheReads / cacheWrites * 100)}% utilization). Context likely expires before reuse.`,
          impact:     writeCost > 0.01 ? `$${writeCost.toFixed(2)} in cache creation overhead` : 'low cost impact',
          action:     'Increase session reuse — reduce time between context creation and consumption',
          confidence: 'high',
        });
      }

      const maxErrRate = Number(errBurst[0]?.max_error_rate ?? 0);
      if (maxErrRate > 20) {
        findings.push({
          id: 'error-burst', category: 'reliability',
          severity:   maxErrRate > 50 ? 'act' : 'warn',
          title:      'Error rate spike detected',
          detail:     `At least one hour in this window had a ${Math.round(maxErrRate)}% error rate. This may indicate rate limiting, model availability issues, or malformed requests.`,
          impact:     `${Math.round(maxErrRate)}% error rate = wasted spend and failed requests`,
          action:     'Check Sessions view during the spike window — look for STATUS.ERROR clusters',
          confidence: 'high',
        });
      }

      const todayHit = Number(cache1d[0]?.hit_ratio ?? 0);
      const weekHit  = Number(cache7d[0]?.hit_ratio ?? 0);
      if (weekHit > 10 && todayHit < weekHit * 0.6) {
        findings.push({
          id: 'cache-decay', category: 'efficiency',
          severity:   'warn',
          title:      'Cache hit rate dropped',
          detail:     `Today: ${todayHit.toFixed(1)}% hit rate vs 7-day avg ${weekHit.toFixed(1)}%. Something changed — session resets, new code path, or context structure shift.`,
          impact:     'Lower cache depth increases fresh input token cost per call',
          action:     'Review recent deployments or session management changes',
          confidence: 'high',
        });
      }

      // Cache underutilization: low overall rate (distinct from cache-decay which detects a drop)
      const windowHit = Number(cache1d[0]?.hit_ratio ?? 0);
      const hasSessions = totalSessions > 20;
      if (hasSessions && windowHit < 15 && weekHit < 15) {
        findings.push({
          id: 'cache-underutilized', category: 'efficiency',
          severity:   'info',
          title:      'Cache utilization is low',
          detail:     `Cache hit rate is ${windowHit.toFixed(1)}% (7-day: ${weekHit.toFixed(1)}%). Prompt caching can reduce input token costs by 60-90% for stable context.`,
          impact:     'Uncached repeated context pays full input token price on every call',
          action:     'Add cache_control: ephemeral to system prompts and stable context blocks',
          confidence: 'medium',
        });
      }

      // Budget findings: check if any enabled budget is at alert or exceeded threshold
      const budgets = await ctx.db.budget.findMany({ where: { enabled: true } });
      if (budgets.length > 0) {
        const BUDGET_PERIOD_MS: Record<string, number> = {
          '1H': 3_600_000, '24H': 86_400_000, '30D': 30 * 86_400_000,
          '90D': 90 * 86_400_000, '1Y': 365 * 86_400_000,
        };
        await Promise.all(budgets.map(async b => {
          const periodMs = BUDGET_PERIOD_MS[b.period] ?? BUDGET_PERIOD_MS['30D'];
          const bSince   = new Date(Date.now() - periodMs);
          const pSql     = b.provider ? Prisma.sql`AND provider = ${b.provider}` : Prisma.empty;
          const prjSql   = b.project  ? Prisma.sql`AND project  = ${b.project}`  : Prisma.empty;
          const rows = await ctx.db.$queryRaw<[{ spend: number }]>`
            SELECT COALESCE(SUM("costUsd"), 0)::float AS spend
            FROM llm_events WHERE ts >= ${bSince} ${pSql} ${prjSql}
          `;
          const spend    = Number(rows[0]?.spend ?? 0);
          const limitUsd = Number(b.limitUsd);
          const pct      = limitUsd > 0 ? (spend / limitUsd) * 100 : 0;
          const scope    = [b.project, b.provider].filter(Boolean).join('/') || 'global';
          if (pct >= 100) {
            findings.push({
              id: `budget-exceeded-${b.id}`, category: 'cost',
              severity: 'act',
              title:    `Budget exceeded — ${scope}`,
              detail:   `Spent $${spend.toFixed(2)} of $${limitUsd.toFixed(2)} limit (${pct.toFixed(0)}%) in the last ${b.period}.`,
              impact:   `$${(spend - limitUsd).toFixed(2)} over limit`,
              action:   'Review spending in Rules view and adjust budget or throttle requests',
              confidence: 'high',
            });
          } else if (pct >= b.alertPct) {
            findings.push({
              id: `budget-alert-${b.id}`, category: 'cost',
              severity: 'warn',
              title:    `Budget approaching — ${scope}`,
              detail:   `Spent $${spend.toFixed(2)} of $${limitUsd.toFixed(2)} limit (${pct.toFixed(0)}%) in the last ${b.period}. Alert threshold: ${b.alertPct}%.`,
              impact:   `$${(limitUsd - spend).toFixed(2)} remaining`,
              action:   'Monitor spend rate — review in Rules view',
              confidence: 'high',
            });
          }
        }));
      }

      const SEV_ORDER: Record<Sev, number> = { act: 0, warn: 1, info: 2 };
      findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

      // Webhook delivery -- fire-and-forget, best-effort
      const webhookRules = await ctx.db.alertRule.findMany({
        where: { enabled: true, webhookUrl: { not: null } },
      });
      if (webhookRules.length > 0) {
        const firedAt = new Date().toISOString();
        const deliveries = webhookRules.flatMap(rule =>
          findings
            .filter(f =>
              f.id === rule.metric ||
              f.category === rule.metric ||
              f.id.startsWith(rule.metric)
            )
            .map(f => ({ rule, finding: f }))
        );
        for (const { rule, finding } of deliveries) {
          fetch(rule.webhookUrl!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id:       finding.id,
              category: finding.category,
              severity: finding.severity,
              title:    finding.title,
              detail:   finding.detail,
              action:   finding.action,
              firedAt,
              rule:     rule.name,
            }),
          }).catch((err: Error) => {
            console.warn(`[observatory] webhook delivery failed for rule "${rule.name}": ${err.message}`);
          });
        }
      }

      return findings;
    }),

  killSession: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.annotation.create({
        data: {
          ts:       new Date(),
          type:     'kill_order',
          title:    input.sessionId,
          detail:   'Killed via Observatory UI',
          severity: 'info',
        },
      });
      return { ok: true };
    }),

  zombieSessions: publicProcedure
    .input(z.object({ provider: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const since24h = new Date(Date.now() - 24 * 3_600_000);
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const killed = await ctx.db.annotation.findMany({
        where:  { type: 'kill_order' },
        select: { title: true },
      });
      const killedSet = new Set(killed.map(k => k.title));

      const rows = await ctx.db.$queryRaw<Array<{
        session_id: string; project: string; surface: string;
        steps: bigint; cost: unknown; first_ts: Date; last_ts: Date;
        first_input: bigint; last_input: bigint;
      }>>`
        SELECT
          "sessionId" AS session_id,
          MODE() WITHIN GROUP (ORDER BY project) AS project,
          MODE() WITHIN GROUP (ORDER BY surface) AS surface,
          COUNT(*) AS steps,
          SUM("costUsd")::float AS cost,
          MIN(ts) AS first_ts,
          MAX(ts) AS last_ts,
          (ARRAY_AGG("inputTokens" + "cachedTokens" ORDER BY ts ASC))[1]  AS first_input,
          (ARRAY_AGG("inputTokens" + "cachedTokens" ORDER BY ts DESC))[1] AS last_input
        FROM llm_events
        WHERE ts >= ${since24h} AND "sessionId" IS NOT NULL ${pfSql}
        GROUP BY "sessionId"
        HAVING COUNT(*) >= 2
        ORDER BY cost DESC
        LIMIT 20
      `;
      const now = Date.now();
      return rows.map(r => {
        const ageMs = now - r.last_ts.getTime();
        const durationMs = r.last_ts.getTime() - r.first_ts.getTime();
        const steps = Number(r.steps);
        const bloatRatio = Number(r.first_input) > 0 ? Number(r.last_input) / Number(r.first_input) : 1;
        let type = 'active';
        if (Number(r.cost) > 5 && r.surface === 'automation') type = 'runaway';
        else if (steps > 10 && ageMs > 10 * 60_000) type = 'loop';
        else if (bloatRatio > 1.5 && ageMs < 60 * 60_000) type = 'bloat';
        else if (ageMs > 30 * 60_000) type = 'abandoned';
        return {
          sessionId: r.session_id,
          project: r.project,
          surface: r.surface,
          steps,
          costUsd: Number(r.cost),
          lastTs: r.last_ts.toISOString(),
          ageMs,
          durationMs,
          type,
          bloatRatio: Math.round(bloatRatio * 100) / 100,
        };
      }).filter(r => r.type !== 'active' && !killedSet.has(r.sessionId));
    }),
});
