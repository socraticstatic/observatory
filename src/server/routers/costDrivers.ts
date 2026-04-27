import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  if (interval === '90 days')  return 90 * 86_400_000;
  if (interval === '365 days') return 365 * 86_400_000;
  return 30 * 86_400_000;
}

const COLORS = ['#6FA8B3', '#9BC4CC', '#C9B08A', '#C8CED1', '#8A9297', '#7CA893', '#B89FC9', '#B88A8A'];

type DetailRow = {
  label:       string | null;
  cost:        unknown;
  calls:       bigint;
  sessions:    bigint;
  avg_lat_ms:  unknown;
  p95_lat_ms:  unknown;
};

function mapDim(rows: DetailRow[]) {
  const total = rows.reduce((s, r) => s + Number(r.cost), 0);
  return rows.map((r, i) => ({
    label:    r.label ?? '(unknown)',
    costUsd:  Number(r.cost),
    pct:      total > 0 ? (Number(r.cost) / total) * 100 : 0,
    color:    COLORS[i % COLORS.length] as string,
    calls:    Number(r.calls),
    sessions: Number(r.sessions),
    avgLatMs: r.avg_lat_ms != null ? Math.round(Number(r.avg_lat_ms)) : null,
    p95LatMs: r.p95_lat_ms != null ? Math.round(Number(r.p95_lat_ms)) : null,
  }));
}

const DIM_SQL = (col: string) => col; // label for TS — SQL written inline per dim

export const costDriversRouter = router({
  sixDimension: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const [byProvider, byModel, bySurface, byProject, byContentType, byRegion, byUser, byPrompt] = await Promise.all([
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT provider AS label, SUM("costUsd")::float AS cost,
            COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events WHERE ts >= ${since} ${pfSql}
          GROUP BY provider ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT model AS label, SUM("costUsd")::float AS cost,
            COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events WHERE ts >= ${since} ${pfSql}
          GROUP BY model ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT surface AS label, SUM("costUsd")::float AS cost,
            COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events WHERE ts >= ${since} ${pfSql}
          GROUP BY surface ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT project AS label, SUM("costUsd")::float AS cost,
            COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events WHERE ts >= ${since} ${pfSql}
          GROUP BY project ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT "contentType" AS label, SUM("costUsd")::float AS cost,
            COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events WHERE ts >= ${since} ${pfSql}
          GROUP BY "contentType" ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT region AS label, SUM("costUsd")::float AS cost,
            COUNT(*)::bigint AS calls, COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events WHERE ts >= ${since} ${pfSql}
          GROUP BY region ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT
            "userId"  AS label,
            SUM("costUsd")::float  AS cost,
            COUNT(*)::bigint       AS calls,
            COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events
          WHERE ts >= ${since} AND "userId" IS NOT NULL ${pfSql}
          GROUP BY "userId"
          ORDER BY cost DESC
          LIMIT 8
        `,
        ctx.db.$queryRaw<DetailRow[]>`
          SELECT "promptHash" AS label,
            SUM("costUsd")::float AS cost,
            COUNT(*)::bigint AS calls,
            COUNT(DISTINCT "sessionId")::bigint AS sessions,
            AVG("latencyMs")::float AS avg_lat_ms,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95_lat_ms
          FROM llm_events
          WHERE ts >= ${since} AND "promptHash" IS NOT NULL ${pfSql}
          GROUP BY "promptHash"
          ORDER BY cost DESC
          LIMIT 8
        `,
      ]);
      void DIM_SQL; // suppress unused warning
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
    }),

  qualityCostByProject: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{
        label: string | null;
        cost: unknown;
        avg_quality: unknown;
        dominant_model: string | null;
        has_quality: boolean;
      }>>`
        SELECT
          COALESCE(project, surface, 'unknown') AS label,
          SUM("costUsd")::float                 AS cost,
          COALESCE(AVG("qualityScore"), 0)::float AS avg_quality,
          MODE() WITHIN GROUP (ORDER BY model)  AS dominant_model,
          (COUNT("qualityScore") > 0)            AS has_quality
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
        GROUP BY COALESCE(project, surface, 'unknown')
        ORDER BY cost DESC
        LIMIT 20
      `;
      return rows.map(r => ({
        label:      r.label ?? 'unknown',
        costUsd:    Number(r.cost),
        quality:    Number(r.avg_quality),
        model:      r.dominant_model ?? 'unknown',
        hasQuality: Boolean(r.has_quality),
      }));
    }),

  contextComposition: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{
        cached:           number;
        cache_creation:   number;
        fresh_input:      number;
        output_tokens:    number;
        reasoning_tokens: number;
      }>>`
        SELECT
          COALESCE(SUM("cachedTokens"),                        0)::float AS cached,
          COALESCE(SUM("cacheCreationTokens"),                 0)::float AS cache_creation,
          COALESCE(SUM("inputTokens"),                         0)::float AS fresh_input,
          COALESCE(SUM("outputTokens"),                        0)::float AS output_tokens,
          COALESCE(SUM("reasoningTokens"),                     0)::float AS reasoning_tokens
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
      `;

      const r = rows[0] ?? { cached: 0, cache_creation: 0, fresh_input: 0, output_tokens: 0, reasoning_tokens: 0 };
      const total = r.cached + r.cache_creation + r.fresh_input + r.output_tokens + r.reasoning_tokens;

      const seg = (val: number, label: string, color: string) => ({
        label,
        tokens: Math.round(val),
        pct:    total > 0 ? (val / total) * 100 : 0,
        color,
      });

      return {
        totalTokens: Math.round(total),
        segments: [
          seg(r.cached,           'Cached Context', '#7CA893'),
          seg(r.cache_creation,   'Cache Write',    '#8BA49C'),
          seg(r.fresh_input,      'Fresh Input',    '#6FA8B3'),
          seg(r.output_tokens,    'Output',         '#C9966B'),
          seg(r.reasoning_tokens, 'Reasoning',      '#A89276'),
        ].filter(s => s.tokens > 0),
      };
    }),

  baseline: publicProcedure
    .input(z.object({ lookback: LookbackSchema.optional(), provider: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Always use last 24H for baseline so projections represent a true daily rate.
      // Using a longer lookback would inflate `dailyCostUsd` by the period length.
      const since24h = new Date(Date.now() - 86_400_000);
      const pfFilter = input?.provider ? { provider: input.provider } : {};
      const pfSql = input?.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;

      const [totals, opusCost, cacheAgg, reasoningAgg, cacheReadRows] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h }, ...pfFilter },
          _sum: { costUsd: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h }, model: { contains: 'opus' }, ...pfFilter },
          _sum: { costUsd: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h }, ...pfFilter },
          _sum: { cachedTokens: true, inputTokens: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h }, ...pfFilter },
          _sum: { reasoningTokens: true, inputTokens: true, outputTokens: true },
        }),
        ctx.db.$queryRaw<[{ cache_read_cost: number }]>`
          SELECT COALESCE(SUM(
            CASE
              WHEN model ILIKE '%claude-opus%'           THEN "cachedTokens"::numeric * 0.0000015
              WHEN model ILIKE '%claude-sonnet%'         THEN "cachedTokens"::numeric * 0.0000003
              WHEN model ILIKE '%claude-haiku%'          THEN "cachedTokens"::numeric * 0.00000008
              WHEN model ILIKE '%gpt-4o-mini%'           THEN "cachedTokens"::numeric * 0.000000075
              WHEN model ILIKE '%gpt-4o%'                THEN "cachedTokens"::numeric * 0.00000125
              WHEN model ILIKE '%gemini-2.5-flash%'      THEN "cachedTokens"::numeric * 0.0000000375
              WHEN model ILIKE '%gemini-2.0-flash%'      THEN "cachedTokens"::numeric * 0.000000025
              WHEN model ILIKE '%gemini%'                THEN "cachedTokens"::numeric * 0.0000003125
              ELSE                                            "cachedTokens"::numeric * 0.0000003
            END
          ), 0)::float AS cache_read_cost
          FROM llm_events
          WHERE ts >= ${since24h} ${pfSql}
        `,
      ]);

      const rawCost       = Number(totals._sum.costUsd ?? 0);
      const cacheReadCost = Number(cacheReadRows[0]?.cache_read_cost ?? 0);
      // Use inference-only cost as the baseline so cache reads don't inflate projections
      const dailyCostUsd  = Math.max(rawCost - cacheReadCost, 0);
      const opusSharePct = dailyCostUsd > 0
        ? (Number(opusCost._sum.costUsd ?? 0) / rawCost) * 100
        : 0;
      const cached    = Number(cacheAgg._sum.cachedTokens ?? 0);
      const inputTok  = Number(cacheAgg._sum.inputTokens ?? 0);
      const cacheDepthPct = (inputTok + cached) > 0 ? (cached / (inputTok + cached)) * 100 : 0;
      const reasoning = Number(reasoningAgg._sum.reasoningTokens ?? 0);
      const totalTok  = Number(reasoningAgg._sum.inputTokens ?? 0)
        + Number(reasoningAgg._sum.outputTokens ?? 0)
        + reasoning;
      const reasoningBudgetPct = totalTok > 0 ? (reasoning / totalTok) * 100 : 0;

      return {
        dailyCostUsd,
        opusSharePct:       Math.round(opusSharePct),
        cacheDepthPct:      Math.round(cacheDepthPct),
        reasoningBudgetPct: Math.round(reasoningBudgetPct),
      };
    }),
});
