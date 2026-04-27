import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';

const PERIOD_MS: Record<string, number> = {
  '1H':  3_600_000,
  '24H': 86_400_000,
  '30D': 30 * 86_400_000,
  '90D': 90 * 86_400_000,
  '1Y':  365 * 86_400_000,
};

const budgetShape = z.object({
  id:       z.string().optional(),
  project:  z.string().optional(),
  provider: z.string().optional(),
  limitUsd: z.number().positive(),
  period:   z.enum(['1H', '24H', '30D', '90D', '1Y']).default('30D'),
  alertPct: z.number().int().min(1).max(100).default(80),
  enabled:  z.boolean().default(true),
});

function normalize(r: {
  id: string; project: string | null; provider: string | null;
  limitUsd: unknown; period: string; alertPct: number; enabled: boolean; createdAt: Date;
}) {
  return {
    id:        r.id,
    project:   r.project,
    provider:  r.provider,
    limitUsd:  Number(r.limitUsd),
    period:    r.period,
    alertPct:  r.alertPct,
    enabled:   r.enabled,
    createdAt: r.createdAt.toISOString(),
  };
}

export const budgetsRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.budget.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(normalize);
    }),

  upsert: publicProcedure
    .input(budgetShape)
    .mutation(async ({ ctx, input }) => {
      const existing = input.id
        ? await ctx.db.budget.findUnique({ where: { id: input.id } })
        : null;

      const data = {
        project:  input.project ?? null,
        provider: input.provider ?? null,
        limitUsd: input.limitUsd,
        period:   input.period,
        alertPct: input.alertPct,
        enabled:  input.enabled,
      };

      const row = existing
        ? await ctx.db.budget.update({ where: { id: input.id! }, data })
        : await ctx.db.budget.create({ data });

      return normalize(row);
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.budget.delete({ where: { id: input.id } });
    }),

  status: publicProcedure
    .query(async ({ ctx }) => {
      const budgets = await ctx.db.budget.findMany({ where: { enabled: true } });
      const results = await Promise.all(budgets.map(async b => {
        const since = new Date(Date.now() - (PERIOD_MS[b.period] ?? PERIOD_MS['30D']));
        const providerSql = b.provider ? Prisma.sql`AND provider = ${b.provider}` : Prisma.empty;
        const projectSql  = b.project  ? Prisma.sql`AND project  = ${b.project}`  : Prisma.empty;
        const rows = await ctx.db.$queryRaw<[{ spend: number }]>`
          SELECT COALESCE(SUM("costUsd"), 0)::float AS spend
          FROM llm_events
          WHERE ts >= ${since} ${providerSql} ${projectSql}
        `;
        const spend   = Number(rows[0]?.spend ?? 0);
        const limitUsd = Number(b.limitUsd);
        const pct     = limitUsd > 0 ? (spend / limitUsd) * 100 : 0;
        return {
          id:        b.id,
          project:   b.project,
          provider:  b.provider,
          period:    b.period,
          limitUsd,
          alertPct:  b.alertPct,
          spendUsd:  spend,
          pct:       Math.round(pct * 10) / 10,
          status:    pct >= 100 ? 'exceeded' : pct >= b.alertPct ? 'alert' : 'ok',
        } as const;
      }));
      return results;
    }),
});
