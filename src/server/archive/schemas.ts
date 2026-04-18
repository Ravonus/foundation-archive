import { z } from "zod";

const contractScanBaseSchema = z.object({
  chainId: z.coerce.number().int().default(1),
  contractAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid contract address"),
  label: z.string().trim().min(1).max(120).optional(),
  foundationContractType: z.string().trim().min(1).max(80).optional(),
  startTokenId: z.coerce.number().int().nonnegative().optional(),
  endTokenId: z.coerce.number().int().nonnegative().optional(),
  fromBlock: z.coerce.number().int().nonnegative().optional(),
  toBlock: z.coerce.number().int().nonnegative().optional(),
});

type ContractScanRangeInput = {
  startTokenId?: number;
  endTokenId?: number;
  fromBlock?: number;
  toBlock?: number;
};

function refineContractScanInput<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
) {
  return schema.superRefine((input, ctx) => {
    const rangeInput = input as ContractScanRangeInput;
    const hasTokenRange =
      typeof rangeInput.startTokenId === "number" &&
      typeof rangeInput.endTokenId === "number";

    if (
      !hasTokenRange &&
      typeof rangeInput.fromBlock !== "number" &&
      typeof rangeInput.toBlock !== "number"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide either a token range or a block range so the scanner knows what to inspect.",
        path: ["startTokenId"],
      });
    }

    if (
      typeof rangeInput.startTokenId === "number" &&
      typeof rangeInput.endTokenId === "number" &&
      rangeInput.endTokenId < rangeInput.startTokenId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End token must be greater than or equal to the start token.",
        path: ["endTokenId"],
      });
    }

    if (
      typeof rangeInput.fromBlock === "number" &&
      typeof rangeInput.toBlock === "number" &&
      rangeInput.toBlock < rangeInput.fromBlock
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End block must be greater than or equal to the start block.",
        path: ["toBlock"],
      });
    }
  });
}

export const foundationMintUrlSchema = z
  .string()
  .trim()
  .url()
  .regex(
    /^https:\/\/foundation\.app\/mint\/(?:eth|base)\/0x[a-fA-F0-9]{40}\/\d+$/,
    "Enter a Foundation mint URL",
  );

export const contractScanInputSchema =
  refineContractScanInput(contractScanBaseSchema);

export const enqueueQueueProcessingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const foundationJobPayloadSchema = z.object({
  url: foundationMintUrlSchema,
  backupPriority: z.number().int().min(0).max(100).optional(),
});

export const publicArchiveWorkInputSchema = z.object({
  chainId: z.number().int().default(1),
  contractAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid contract address"),
  tokenId: z.string().trim().min(1),
  foundationUrl: foundationMintUrlSchema.optional(),
});

export const publicArchiveProfileInputSchema = z.object({
  accountAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid account address"),
  username: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(120).optional(),
});

export const backupArtworkJobPayloadSchema = z.object({
  artworkId: z.string().min(1),
});

export const ingestContractTokenJobPayloadSchema = z.object({
  chainId: z.number().int().default(1),
  contractAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid contract address"),
  tokenId: z.string().trim().min(1),
  backupPriority: z.number().int().min(0).max(100).optional(),
});

export const contractScanJobPayloadSchema = refineContractScanInput(
  contractScanBaseSchema.extend({
    chainId: z.number().int().default(1),
  }),
);
