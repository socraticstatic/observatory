import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { LookbackSchema, lookbackToInterval } from '@/lib/lookback';
import { getBillingUnit } from '@/lib/service-registry';

function msSince(interval: string): number {
  if (interval === '1 hour') return 3_600_000;
  if (interval === '24 hours') return 86_400_000;
  if (interval === '90 days')  return 90 * 86_400_000;
  if (interval === '365 days') return 365 * 86_400_000;
  return 30 * 86_400_000;
}

interface TraceNode {
  id: string;
  ts: string;
  provider: string;
  model: string;
  spanId: string | null;
  parentSpanId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latencyMs: number | null;
  status: string;
  surface: string | null;
  project: string | null;
  sessionId: string | null;
  userId: string | null;
  children: TraceNode[];
}

function isDescendant(node: TraceNode, target: TraceNode): boolean {
  for (const child of node.children) {
    if (child === target || isDescendant(child, target)) return true;
  }
  return false;
}

function assembleTree(events: Array<{
  id: string; ts: Date; provider: string; model: string;
  spanId: string | null; parentSpanId: string | null;
  inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens: number;
  costUsd: unknown; latencyMs: number | null; status: string;
  surface: string | null; project: string | null; sessionId: string | null; userId: string | null;
}>): TraceNode[] {
  const nodeMap = new Map<string, TraceNode>();
  const roots: TraceNode[] = [];

  for (const e of events) {
    const node: TraceNode = {
      id: e.id, ts: e.ts.toISOString(),
      provider: e.provider, model: e.model,
      spanId: e.spanId, parentSpanId: e.parentSpanId,
      inputTokens: e.inputTokens, outputTokens: e.outputTokens,
      cachedTokens: e.cachedTokens, reasoningTokens: e.reasoningTokens,
      costUsd: Number(e.costUsd), latencyMs: e.latencyMs,
      status: e.status, surface: e.surface, project: e.project,
      sessionId: e.sessionId, userId: e.userId,
      children: [],
    };
    nodeMap.set(e.id, node);
    if (e.spanId) nodeMap.set(e.spanId, node);
  }

  for (const e of events) {
    const node = nodeMap.get(e.id)!;
    const parent = e.parentSpanId ? nodeMap.get(e.parentSpanId) : null;

    if (parent && parent !== node && !isDescendant(node, parent)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export const tracesRouter = router({
  list: publicProcedure
    .input(z.object({
      lookback: LookbackSchema,
      provider: z.string().optional(),
      status: z.enum(['ok', 'error']).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));

      // Composite cursor: { ts, id } prevents skipping events with duplicate timestamps
      let cursorTs: Date | undefined;
      let cursorId: string | undefined;
      if (input.cursor) {
        try {
          const parsed = JSON.parse(input.cursor) as { ts: string; id: string };
          cursorTs = new Date(parsed.ts);
          cursorId = parsed.id;
        } catch {
          cursorTs = new Date(input.cursor); // backward compat with old ts-only cursors
        }
      }

      const items = await ctx.db.llmEvent.findMany({
        where: {
          ts: { gte: since },
          ...(cursorTs && cursorId
            ? { OR: [{ ts: { lt: cursorTs } }, { ts: cursorTs, id: { lt: cursorId } }] }
            : cursorTs
              ? { ts: { lt: cursorTs } }
              : {}),
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.status   ? { status: input.status }     : {}),
        },
        orderBy: [{ ts: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        select: {
          id: true, ts: true, provider: true, model: true,
          inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true,
          costUsd: true, latencyMs: true, status: true,
          sessionId: true, project: true, surface: true, contentType: true,
          rawPayload: true,
        },
      });
      const hasMore = items.length > input.limit;
      const page    = hasMore ? items.slice(0, -1) : items;
      const last    = page[page.length - 1];
      return {
        items: page.map(e => ({
          id:              e.id,
          ts:              e.ts.toISOString(),
          provider:        e.provider,
          model:           e.model,
          inputTokens:     e.inputTokens,
          outputTokens:    e.outputTokens,
          cachedTokens:    e.cachedTokens,
          reasoningTokens: e.reasoningTokens,
          costUsd:         Number(e.costUsd),
          latencyMs:       e.latencyMs ?? null,
          status:          e.status,
          sessionId:       e.sessionId  ?? null,
          project:         e.project    ?? null,
          surface:         e.surface    ?? null,
          contentType:     e.contentType ?? null,
          billingUnit:     getBillingUnit(e.provider),
          rawPayload:      e.rawPayload,
        })),
        nextCursor: hasMore && last ? JSON.stringify({ ts: last.ts.toISOString(), id: last.id }) : null,
      };
    }),

  listTree: publicProcedure
    .input(z.object({
      lookback: LookbackSchema,
      provider: z.string().optional(),
      project:  z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - msSince(lookbackToInterval(input.lookback)));
      const where = {
        ts: { gte: since },
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.project  ? { project:  input.project  } : {}),
      };
      const events = await ctx.db.llmEvent.findMany({
        where,
        orderBy: { ts: 'asc' },
        take: 500,
        select: {
          id: true, ts: true, provider: true, model: true,
          spanId: true, parentSpanId: true,
          inputTokens: true, outputTokens: true, cachedTokens: true, reasoningTokens: true,
          costUsd: true, latencyMs: true, status: true,
          surface: true, project: true, sessionId: true, userId: true,
        },
      });
      return assembleTree(events);
    }),
});
