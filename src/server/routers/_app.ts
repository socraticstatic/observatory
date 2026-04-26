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
import { sessionsRouter } from './sessions';
import { costDriversRouter } from './costDrivers';
import { servicesRouter } from './services';
import { archiveRouter } from './archive';
import { healthRouter } from './health';
import { sessionLabelsRouter } from './sessionLabels';
import { alertRulesRouter } from './alertRules';

export const appRouter = router({
  pulse:        pulseRouter,
  health:       healthRouter,
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
  sessions:     sessionsRouter,
  costDrivers:  costDriversRouter,
  services:      servicesRouter,
  archive:       archiveRouter,
  sessionLabels: sessionLabelsRouter,
  alertRules:    alertRulesRouter,
});

export type AppRouter = typeof appRouter;
