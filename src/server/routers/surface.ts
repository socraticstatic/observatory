import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

export const surfaceRouter = router({
  appSurface: publicProcedure
    .input(z.object({ lookback: LookbackSchema, provider: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const pfSql = input.provider ? Prisma.sql`AND provider = ${input.provider}` : Prisma.empty;
      const rows = await ctx.db.$queryRaw<Array<{
        surface: string; calls: bigint; cost: unknown;
        avg_lat: unknown; p50_lat: unknown; sessions: bigint;
      }>>`
        SELECT
          COALESCE(surface, 'unknown') AS surface,
          COUNT(*) AS calls,
          SUM("costUsd")::float AS cost,
          AVG("latencyMs")::float AS avg_lat,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50_lat,
          COUNT(DISTINCT "sessionId") AS sessions
        FROM llm_events
        WHERE ts >= ${since} ${pfSql}
        GROUP BY surface
        ORDER BY cost DESC
      `;
      const totalCost = rows.reduce((s, r) => s + Number(r.cost), 0);
      return rows.map(r => ({
        id: r.surface,
        label: r.surface,
        calls: Number(r.calls),
        costUsd: Number(r.cost),
        sharePct: totalCost > 0 ? (Number(r.cost) / totalCost) * 100 : 0,
        avgLatMs: Math.round(Number(r.avg_lat) ?? 0),
        p50LatMs: Math.round(Number(r.p50_lat) ?? 0),
        sessions: Number(r.sessions),
      }));
    }),
});
