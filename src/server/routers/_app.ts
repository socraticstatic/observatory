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
import { tracesRouter } from './traces';
import { costDriversRouter } from './cost-drivers';

export const appRouter = router({
  pulse:        pulseRouter,
  what:         whatRouter,
  who:          whoRouter,
  where:        whereRouter,
  when:         whenRouter,
  how:          howRouter,
  content:      contentRouter,
  surface:      surfaceRouter,
  events:       eventsRouter,
  entity:       entityRouter,
  insights:     insightsRouter,
  traces:       tracesRouter,
  costDrivers:  costDriversRouter,
});

export type AppRouter = typeof appRouter;
