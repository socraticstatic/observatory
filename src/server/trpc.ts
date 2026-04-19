// src/server/trpc.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { db } from './db';

export const createContext = () => ({ db });
export type Context = ReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
