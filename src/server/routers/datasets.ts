import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const datasetsRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      const rows = await ctx.db.evalDataset.findMany({
        orderBy: { createdAt: 'desc' },
        include: { items: { select: { id: true } } },
      });
      return rows.map(r => ({
        id:        r.id,
        name:      r.name,
        itemCount: r.items.length,
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.evalDataset.create({ data: { name: input.name } });
      return { id: row.id, name: row.name, itemCount: 0, createdAt: row.createdAt.toISOString() };
    }),

  addItem: publicProcedure
    .input(z.object({
      datasetId: z.string().min(1),
      eventId:   z.string().min(1),
      note:      z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.evalDatasetItem.create({
        data: {
          datasetId: input.datasetId,
          eventId:   input.eventId,
          note:      input.note ?? null,
        },
      });
      return {
        id:        row.id,
        datasetId: row.datasetId,
        eventId:   row.eventId,
        note:      row.note,
        addedAt:   row.addedAt.toISOString(),
      };
    }),

  removeItem: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.evalDatasetItem.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  items: publicProcedure
    .input(z.object({ datasetId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.evalDataset.findUnique({
        where:   { id: input.datasetId },
        include: { items: { orderBy: { addedAt: 'desc' } } },
      });
      if (!row) return [];
      return row.items.map(item => ({
        id:      item.id,
        eventId: item.eventId,
        note:    item.note,
        addedAt: item.addedAt.toISOString(),
      }));
    }),
});
