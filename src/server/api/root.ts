import { archiveRouter } from "~/server/api/routers/archive";
import { pinHostsRouter } from "~/server/api/routers/pin-hosts";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  archive: archiveRouter,
  pinHosts: pinHostsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
