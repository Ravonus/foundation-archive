import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  getPinnedWorkStates,
  listPinHosts,
  pinWorkToHosts,
  removePinHost,
  upsertPinHost,
} from "~/server/pin-hosts/service";

const ownerTokenSchema = z.string().trim().min(16);

const pinHostKindSchema = z.enum(["PSA", "KUBO_RPC"]);
const pinHostAuthModeSchema = z.enum([
  "NONE",
  "BEARER",
  "BASIC",
  "CUSTOM_HEADER",
]);

const hostedWorkSchema = z.object({
  title: z.string().trim().min(1).max(240),
  chainId: z.number().int().default(1),
  contractAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid contract address"),
  tokenId: z.string().trim().min(1).max(120),
  metadataCid: z.string().trim().min(1).optional().nullable(),
  mediaCid: z.string().trim().min(1).optional().nullable(),
});

export const pinHostsRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        ownerToken: ownerTokenSchema,
      }),
    )
    .query(({ ctx, input }) => listPinHosts(ctx.db, input.ownerToken)),

  upsert: publicProcedure
    .input(
      z.object({
        ownerToken: ownerTokenSchema,
        hostId: z.string().trim().min(1).optional().nullable(),
        label: z.string().trim().min(1).max(120),
        presetKey: z.string().trim().min(1).max(80),
        kind: pinHostKindSchema,
        endpointUrl: z.string().trim().url(),
        publicGatewayUrl: z.string().trim().url().optional().nullable(),
        authMode: pinHostAuthModeSchema,
        authToken: z.string().trim().max(4000).optional().nullable(),
        authUsername: z.string().trim().max(255).optional().nullable(),
        authPassword: z.string().trim().max(4000).optional().nullable(),
        authHeaderName: z.string().trim().max(255).optional().nullable(),
        enabled: z.boolean().optional(),
        autoPin: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hostId = await upsertPinHost(ctx.db, {
        ...input,
        hostId: input.hostId ?? null,
      });
      return {
        hostId,
        hosts: await listPinHosts(ctx.db, input.ownerToken),
      };
    }),

  remove: publicProcedure
    .input(
      z.object({
        ownerToken: ownerTokenSchema,
        hostId: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await removePinHost(ctx.db, input);
      return {
        hosts: await listPinHosts(ctx.db, input.ownerToken),
      };
    }),

  pinWork: publicProcedure
    .input(
      z.object({
        ownerToken: ownerTokenSchema,
        hostIds: z.array(z.string().trim().min(1)).optional().nullable(),
        useAutoPin: z.boolean().optional(),
        work: hostedWorkSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      pinWorkToHosts(ctx.db, {
        ownerToken: input.ownerToken,
        hostIds: input.hostIds ?? null,
        useAutoPin: input.useAutoPin,
        work: input.work,
      }),
    ),

  getWorkStates: publicProcedure
    .input(
      z.object({
        ownerToken: ownerTokenSchema,
        works: z.array(hostedWorkSchema).max(48),
      }),
    )
    .query(({ ctx, input }) =>
      getPinnedWorkStates(ctx.db, {
        ownerToken: input.ownerToken,
        works: input.works,
      }),
    ),
});
