import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

const COLORS = ['#6FA8B3', '#9BC4CC', '#C9966B', '#4F7B83', '#C9B08A', '#B88A8A', '#8A9297', '#7A8A60'];

type RawRow = { label: string | null; cost: unknown };

function mapDim(rows: RawRow[]) {
  const total = rows.reduce((s, r) => s + Number(r.cost), 0);
  return rows.map((r, i) => ({
    label: r.label ?? '(unknown)',
    costUsd: Number(r.cost),
    pct: total > 0 ? (Number(r.cost) / total) * 100 : 0,
    color: COLORS[i % COLORS.length],
  }));
}

export const costDriversRouter = router({
  sixDimension: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const [byProvider, byModel, bySurface, byProject, byContentType, byRegion] = await Promise.all([
        ctx.db.$queryRaw<RawRow[]>`
          SELECT provider AS label, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY provider ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<RawRow[]>`
          SELECT model AS label, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY model ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<RawRow[]>`
          SELECT surface AS label, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY surface ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<RawRow[]>`
          SELECT project AS label, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY project ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<RawRow[]>`
          SELECT "contentType" AS label, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY "contentType" ORDER BY cost DESC LIMIT 8`,
        ctx.db.$queryRaw<RawRow[]>`
          SELECT region AS label, SUM("costUsd")::float AS cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY region ORDER BY cost DESC LIMIT 8`,
      ]);
      return {
        provider:    mapDim(byProvider),
        model:       mapDim(byModel),
        surface:     mapDim(bySurface),
        project:     mapDim(byProject),
        contentType: mapDim(byContentType),
        region:      mapDim(byRegion),
      };
    }),

  qualityCostByProject: publicProcedure
    .input(z.object({ lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const rows = await ctx.db.$queryRaw<Array<{
        label: string | null;
        cost: unknown;
        avg_quality: unknown;
        dominant_model: string | null;
      }>>`
        SELECT
          COALESCE(project, surface, 'unknown') AS label,
          SUM("costUsd")::float AS cost,
          AVG("qualityScore")::float AS avg_quality,
          MODE() WITHIN GROUP (ORDER BY model) AS dominant_model
        FROM llm_events
        WHERE ts >= ${since} AND "qualityScore" IS NOT NULL
        GROUP BY COALESCE(project, surface, 'unknown')
        ORDER BY cost DESC
        LIMIT 20
      `;
      return rows.map(r => ({
        label:   r.label ?? 'unknown',
        costUsd: Number(r.cost),
        quality: Number(r.avg_quality),
        model:   r.dominant_model ?? 'unknown',
      }));
    }),

  baseline: publicProcedure
    .query(async ({ ctx }) => {
      const since24h = new Date(Date.now() - 86_400_000);
      const [totals, opusCost, cacheAgg, reasoningAgg] = await Promise.all([
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h } },
          _sum: { costUsd: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h }, model: { contains: 'opus' } },
          _sum: { costUsd: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h } },
          _sum: { cachedTokens: true, inputTokens: true },
        }),
        ctx.db.llmEvent.aggregate({
          where: { ts: { gte: since24h } },
          _sum: { reasoningTokens: true, inputTokens: true, outputTokens: true },
        }),
      ]);

      const dailyCostUsd = Number(totals._sum.costUsd ?? 0);
      const opusSharePct = dailyCostUsd > 0
        ? (Number(opusCost._sum.costUsd ?? 0) / dailyCostUsd) * 100
        : 0;
      const cached = Number(cacheAgg._sum.cachedTokens ?? 0);
      const inputTok = Number(cacheAgg._sum.inputTokens ?? 0);
      const cacheDepthPct = (inputTok + cached) > 0 ? (cached / (inputTok + cached)) * 100 : 0;
      const reasoning = Number(reasoningAgg._sum.reasoningTokens ?? 0);
      const totalTok = Number(reasoningAgg._sum.inputTokens ?? 0)
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
