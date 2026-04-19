import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    ARCHIVE_STORAGE_DIR: z.string().min(1).default("./archive-storage"),
    ARCHIVE_HOT_STORAGE_DIR: z.string().min(1).default("./archive-storage-hot"),
    ARCHIVE_ARCHIVER_URL: z.string().url().optional(),
    FOUNDATION_BASE_URL: z
      .string()
      .url()
      .default("https://foundation.app"),
    FOUNDATION_GRAPHQL_API_URL: z
      .string()
      .url()
      .default("https://api.prod.foundation.app/graphql"),
    IPFS_GATEWAY_BASE_URL: z
      .string()
      .url()
      .default("https://ipfs.io"),
    KUBO_API_URL: z.string().url().optional(),
    KUBO_API_AUTH_HEADER: z.string().optional(),
    ETHEREUM_RPC_URL: z.string().url().optional(),
    BASE_RPC_URL: z.string().url().optional(),
    INTERNAL_CRON_SECRET: z.string().min(1).optional(),
    AUTO_CRAWLER_ENABLED: z.coerce.boolean().default(true),
    AUTO_SCAN_BLOCK_WINDOW: z.coerce.number().int().positive().default(50000),
    AUTO_SCAN_CONTRACTS_PER_TICK: z.coerce.number().int().positive().default(1),
    SMART_PIN_START_BYTES: z.coerce.number().int().positive().default(5242880),
    SMART_PIN_CEILING_BYTES: z.coerce.number().int().positive().default(268435456),
    SMART_PIN_GROWTH_FACTOR: z.coerce.number().positive().default(2),
    SMART_PIN_DEFER_MS: z.coerce.number().int().positive().default(60000),
    ARCHIVE_DIRECTORY_MAX_BYTES: z
      .coerce.number()
      .int()
      .positive()
      .default(524288000),
    ARCHIVE_SOCKET_PORT: z.coerce.number().int().positive().default(43129),
    ARCHIVE_SOCKET_INTERNAL_URL: z
      .string()
      .url()
      .default("http://127.0.0.1:43129"),
  },

  client: {
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .url()
      .default("https://foundation.agorix.io"),
    NEXT_PUBLIC_ARCHIVE_SOCKET_URL: z.string().url().optional(),
    NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.string().url().optional(),
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().uuid().optional(),
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
  },

  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    ARCHIVE_STORAGE_DIR: process.env.ARCHIVE_STORAGE_DIR,
    ARCHIVE_HOT_STORAGE_DIR: process.env.ARCHIVE_HOT_STORAGE_DIR,
    ARCHIVE_ARCHIVER_URL: process.env.ARCHIVE_ARCHIVER_URL,
    FOUNDATION_BASE_URL: process.env.FOUNDATION_BASE_URL,
    FOUNDATION_GRAPHQL_API_URL: process.env.FOUNDATION_GRAPHQL_API_URL,
    IPFS_GATEWAY_BASE_URL: process.env.IPFS_GATEWAY_BASE_URL,
    KUBO_API_URL: process.env.KUBO_API_URL,
    KUBO_API_AUTH_HEADER: process.env.KUBO_API_AUTH_HEADER,
    ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL,
    BASE_RPC_URL: process.env.BASE_RPC_URL,
    INTERNAL_CRON_SECRET: process.env.INTERNAL_CRON_SECRET,
    AUTO_CRAWLER_ENABLED: process.env.AUTO_CRAWLER_ENABLED,
    AUTO_SCAN_BLOCK_WINDOW: process.env.AUTO_SCAN_BLOCK_WINDOW,
    AUTO_SCAN_CONTRACTS_PER_TICK: process.env.AUTO_SCAN_CONTRACTS_PER_TICK,
    SMART_PIN_START_BYTES: process.env.SMART_PIN_START_BYTES,
    SMART_PIN_CEILING_BYTES: process.env.SMART_PIN_CEILING_BYTES,
    SMART_PIN_GROWTH_FACTOR: process.env.SMART_PIN_GROWTH_FACTOR,
    SMART_PIN_DEFER_MS: process.env.SMART_PIN_DEFER_MS,
    ARCHIVE_DIRECTORY_MAX_BYTES: process.env.ARCHIVE_DIRECTORY_MAX_BYTES,
    ARCHIVE_SOCKET_PORT: process.env.ARCHIVE_SOCKET_PORT,
    ARCHIVE_SOCKET_INTERNAL_URL: process.env.ARCHIVE_SOCKET_INTERNAL_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_ARCHIVE_SOCKET_URL: process.env.NEXT_PUBLIC_ARCHIVE_SOCKET_URL,
    NEXT_PUBLIC_UMAMI_SCRIPT_URL: process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
