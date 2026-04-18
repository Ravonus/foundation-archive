import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { isAllowedAdminRequest } from "~/server/admin-access";
import { db } from "~/server/db";

export const createTRPCContext = (opts: { headers: Headers }) => ({
  db,
  ...opts,
});

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  console.warn(`[TRPC] ${path} took ${Date.now() - start}ms to execute`);

  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);

const lanOnlyAdminMiddleware = t.middleware(({ ctx, next }) => {
  if (!isAllowedAdminRequest(ctx.headers)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access is limited to the local network.",
    });
  }

  return next();
});

export const lanAdminProcedure = t.procedure
  .use(timingMiddleware)
  .use(lanOnlyAdminMiddleware);
