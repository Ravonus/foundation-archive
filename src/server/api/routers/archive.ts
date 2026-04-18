import { z } from "zod";

import {
  enqueueContractScan,
  enqueueFoundationMintIngest,
  processQueuedJobs,
  requestArtworkArchive,
  requestProfileArchive,
  seedKnownContracts,
} from "~/server/archive/jobs";
import {
  contractScanInputSchema,
  enqueueQueueProcessingSchema,
  foundationMintUrlSchema,
  publicArchiveProfileInputSchema,
  publicArchiveWorkInputSchema,
} from "~/server/archive/schemas";
import {
  getArchivePolicyState,
  setArchiveAutoCrawlerEnabled,
  setArchivePace,
} from "~/server/archive/state";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const archiveRouter = createTRPCRouter({
  enqueueFoundationUrl: publicProcedure
    .input(
      z.object({
        url: foundationMintUrlSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const job = await enqueueFoundationMintIngest(ctx.db, input.url);
      return {
        jobId: job.id,
      };
    }),

  enqueueContractScan: publicProcedure
    .input(contractScanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await enqueueContractScan(ctx.db, input);
      return {
        jobId: job.id,
      };
    }),

  requestArtworkArchive: publicProcedure
    .input(publicArchiveWorkInputSchema)
    .mutation(async ({ ctx, input }) => {
      return requestArtworkArchive(ctx.db, input);
    }),

  requestProfileArchive: publicProcedure
    .input(publicArchiveProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
      return requestProfileArchive(ctx.db, input);
    }),

  processQueue: publicProcedure
    .input(enqueueQueueProcessingSchema)
    .mutation(async ({ ctx, input }) => {
      return processQueuedJobs(ctx.db, input.limit);
    }),

  setAutoCrawlerEnabled: publicProcedure
    .input(
      z.object({
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const policy = await setArchiveAutoCrawlerEnabled(ctx.db, input.enabled);
      return {
        autoCrawlerEnabled: policy.autoCrawlerEnabled,
      };
    }),

  setArchivePace: publicProcedure
    .input(
      z.object({
        pace: z.enum(["slow", "steady", "fast"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const policy = await setArchivePace(ctx.db, input.pace);
      return {
        contractsPerTick: policy.contractsPerTick,
      };
    }),

  getAutoCrawlerState: publicProcedure.query(async ({ ctx }) => {
    const policy = await getArchivePolicyState(ctx.db);
    return {
      autoCrawlerEnabled: policy.autoCrawlerEnabled,
      contractsPerTick: policy.contractsPerTick,
    };
  }),

  seedKnownContracts: publicProcedure.mutation(async ({ ctx }) => {
    const contracts = await seedKnownContracts(ctx.db);
    return {
      count: contracts.length,
    };
  }),
});
