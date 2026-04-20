import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';

const DIM_SCHEMA = z.enum(['model', 'surface', 'tokenClass', 'taskType', 'template', 'toolCall']);
type Dim = z.infer<typeof DIM_SCHEMA>;

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  return 30 * 86_400_000;
}

const GROUP_EXPR: Record<Exclude<Dim, 'tokenClass'>, ReturnType<typeof Prisma.raw>> = {
  model:    Prisma.raw('"model"'),
  surface:  Prisma.raw('COALESCE("surface", \'unknown\')'),
  taskType: Prisma.raw('COALESCE("contentType", \'unknown\')'),
  template: Prisma.raw('COALESCE("project", \'untagged\')'),
  toolCall: Prisma.raw('COALESCE("contentType", \'unknown\')'),
};

export const costDriversRouter = router({
  attribution: publicProcedure
    .input(z.object({ dim: DIM_SCHEMA, lookback: LookbackSchema }))
    .query(async ({ ctx, input }) => {
      const interval = lookbackToInterval(input.lookback);
      const since = new Date(Date.now() - msSince(interval));
      const week = new Date(Date.now() - 7 * 86_400_000);
      const prior = new Date(Date.now() - 14 * 86_400_000);

      if (input.dim === 'tokenClass') {
        const [cur, prev] = await Promise.all([
          ctx.db.$queryRaw<Array<{
            total_cost: number; output: number; reasoning: number;
            input_tok: number; cached_read: number; cached_write: number;
          }>>`
            SELECT
              SUM("costUsd")::float            AS total_cost,
              SUM("outputTokens")::float        AS output,
              SUM("reasoningTokens")::float     AS reasoning,
              SUM("inputTokens")::float         AS input_tok,
              SUM("cachedTokens")::float        AS cached_read,
              SUM("cacheCreationTokens")::float AS cached_write
            FROM llm_events WHERE ts >= ${since}
          `,
          ctx.db.$queryRaw<Array<{
            output: number; reasoning: number; input_tok: number;
            cached_read: number; cached_write: number;
          }>>`
            SELECT
              SUM("outputTokens")::float        AS output,
              SUM("reasoningTokens")::float     AS reasoning,
              SUM("inputTokens")::float         AS input_tok,
              SUM("cachedTokens")::float        AS cached_read,
              SUM("cacheCreationTokens")::float AS cached_write
            FROM llm_events WHERE ts >= ${prior} AND ts < ${week}
          `,
        ]);
        const c = cur[0] ?? { total_cost: 0, output: 0, reasoning: 0, input_tok: 0, cached_read: 0, cached_write: 0 };
        const p = prev[0] ?? { output: 0, reasoning: 0, input_tok: 0, cached_read: 0, cached_write: 0 };
        const totalCost = Number(c.total_cost);

        const curW = {
          output:       Number(c.output)      * 5,
          reasoning:    Number(c.reasoning)   * 5,
          input:        Number(c.input_tok)   * 1,
          cached_read:  Number(c.cached_read) * 0.1,
          cached_write: Number(c.cached_write)* 1.25,
        };
        const prevW = {
          output:       Number(p.output)      * 5,
          reasoning:    Number(p.reasoning)   * 5,
          input:        Number(p.input_tok)   * 1,
          cached_read:  Number(p.cached_read) * 0.1,
          cached_write: Number(p.cached_write)* 1.25,
        };
        const totalW     = Object.values(curW).reduce((a, b) => a + b, 0);
        const totalPrevW = Object.values(prevW).reduce((a, b) => a + b, 0);

        const buckets: Array<{ key: string; cw: number; pw: number; sub: string }> = [
          { key: 'Output',         cw: curW.output,       pw: prevW.output,       sub: `${(Number(c.output)/1e6).toFixed(1)}M tokens` },
          { key: 'Reasoning',      cw: curW.reasoning,    pw: prevW.reasoning,    sub: `${(Number(c.reasoning)/1e6).toFixed(1)}M tokens` },
          { key: 'Input',          cw: curW.input,        pw: prevW.input,        sub: `${(Number(c.input_tok)/1e6).toFixed(1)}M tokens` },
          { key: 'Cached (read)',  cw: curW.cached_read,  pw: prevW.cached_read,  sub: `${(Number(c.cached_read)/1e6).toFixed(1)}M tokens` },
          { key: 'Cached (write)', cw: curW.cached_write, pw: prevW.cached_write, sub: `${(Number(c.cached_write)/1e6).toFixed(1)}M tokens` },
        ];

        return buckets.map(b => ({
          key:      b.key,
          costUsd:  totalW > 0 ? (b.cw / totalW) * totalCost : 0,
          pctShare: totalW > 0 ? b.cw / totalW : 0,
          delta7d:  totalPrevW > 0 && b.pw > 0
            ? ((b.cw / totalW) - (b.pw / totalPrevW)) / (b.pw / totalPrevW)
            : 0,
          sub: b.sub,
        }));
      }

      const grp = GROUP_EXPR[input.dim];
      const [rows, prevRows] = await Promise.all([
        ctx.db.$queryRaw<Array<{ k: string; cost: number; calls: bigint; sessions: bigint }>>(
          Prisma.sql`
            SELECT
              ${grp}                                 AS k,
              SUM("costUsd")::float                  AS cost,
              COUNT(*)                               AS calls,
              COUNT(DISTINCT "sessionId")            AS sessions
            FROM llm_events WHERE ts >= ${since}
            GROUP BY k ORDER BY cost DESC LIMIT 12
          `
        ),
        ctx.db.$queryRaw<Array<{ k: string; cost: number }>>(
          Prisma.sql`
            SELECT ${grp} AS k, SUM("costUsd")::float AS cost
            FROM llm_events WHERE ts >= ${prior} AND ts < ${week}
            GROUP BY k
          `
        ),
      ]);

      const prevMap = new Map(prevRows.map(r => [r.k, Number(r.cost)]));
      const totalCost = rows.reduce((a, r) => a + Number(r.cost), 0);

      return rows.map(r => {
        const cost = Number(r.cost);
        const calls = Number(r.calls);
        const sessions = Number(r.sessions);
        const prevCost = prevMap.get(r.k) ?? 0;
        const delta7d = prevCost > 0 ? (cost - prevCost) / prevCost : 0;
        const sub =
          input.dim === 'template'
            ? `${sessions} sessions · avg $${sessions > 0 ? (cost / sessions).toFixed(2) : '0.00'}`
            : `${calls} calls · ${sessions} sessions`;
        return { key: r.k, costUsd: cost, pctShare: totalCost > 0 ? cost / totalCost : 0, delta7d, sub };
      });
    }),

  history: publicProcedure
    .input(z.object({ dim: DIM_SCHEMA, key: z.string() }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - 30 * 86_400_000);

      if (input.dim === 'tokenClass') {
        const rows = await ctx.db.$queryRaw<Array<{
          day: Date; output: number; reasoning: number; input_tok: number;
          cached_read: number; cached_write: number; total_cost: number;
        }>>`
          SELECT
            date_trunc('day', ts)             AS day,
            SUM("outputTokens")::float        AS output,
            SUM("reasoningTokens")::float     AS reasoning,
            SUM("inputTokens")::float         AS input_tok,
            SUM("cachedTokens")::float        AS cached_read,
            SUM("cacheCreationTokens")::float AS cached_write,
            SUM("costUsd")::float             AS total_cost
          FROM llm_events WHERE ts >= ${since}
          GROUP BY day ORDER BY day ASC
        `;
        return rows.map(r => {
          const totalW = Number(r.output)*5 + Number(r.reasoning)*5 + Number(r.input_tok) + Number(r.cached_read)*0.1 + Number(r.cached_write)*1.25;
          const thisW = input.key === 'Output'         ? Number(r.output)*5
                      : input.key === 'Reasoning'      ? Number(r.reasoning)*5
                      : input.key === 'Input'          ? Number(r.input_tok)
                      : input.key === 'Cached (read)'  ? Number(r.cached_read)*0.1
                      : input.key === 'Cached (write)' ? Number(r.cached_write)*1.25
                      : 0;
          return { day: r.day.toISOString().slice(0, 10), costUsd: totalW > 0 ? (thisW / totalW) * Number(r.total_cost) : 0 };
        });
      }

      const grp = GROUP_EXPR[input.dim];
      const rows = await ctx.db.$queryRaw<Array<{ day: Date; cost: number }>>(
        Prisma.sql`
          SELECT date_trunc('day', ts) AS day, SUM("costUsd")::float AS cost
          FROM llm_events
          WHERE ts >= ${since} AND ${grp} = ${input.key}
          GROUP BY day ORDER BY day ASC
        `
      );
      return rows.map(r => ({ day: r.day.toISOString().slice(0, 10), costUsd: Number(r.cost) }));
    }),

  monthSummary: publicProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const [mtd, lastMonth] = await Promise.all([
      ctx.db.llmEvent.aggregate({ where: { ts: { gte: monthStart } }, _sum: { costUsd: true } }),
      ctx.db.llmEvent.aggregate({ where: { ts: { gte: lastMonthStart, lt: lastMonthEnd } }, _sum: { costUsd: true } }),
    ]);

    const mtdCost = Number(mtd._sum.costUsd ?? 0);
    const lastMonthCost = Number(lastMonth._sum.costUsd ?? 0);
    const projectedEOM = dayOfMonth > 0 ? (mtdCost / dayOfMonth) * daysInMonth : 0;

    return { mtdCost, projectedEOM, lastMonthCost, budget: 2400, dayOfMonth, daysInMonth };
  }),
});
