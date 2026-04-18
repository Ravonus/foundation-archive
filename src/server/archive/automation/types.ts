import { ContractKind, type PrismaClient } from "~/server/prisma-client";
import { getAddress } from "viem";

export type DatabaseClient = PrismaClient;
export type DiscoverySource = "drops" | "editions" | "collections";

// Foundation's collections search accepts an empty query and returns the
// paginated full catalog, which is a much better archive seed than term scans.
export const COLLECTION_DISCOVERY_TERMS = [""];
export const API_REVISIT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function activeCollectionDiscoveryQuery(index: number) {
  return COLLECTION_DISCOVERY_TERMS[index % COLLECTION_DISCOVERY_TERMS.length] ?? "";
}

export function normalizeAddress(address: string) {
  return getAddress(address).toLowerCase();
}

export function contractKindFromFoundationType(
  input: string | null | undefined,
) {
  const value = (input ?? "").toUpperCase();

  if (value === "FND") return ContractKind.FOUNDATION_GENESIS;
  if (
    value === "FND_COLLECTION" ||
    value === "LIMITED_EDITION" ||
    value === "FND_BATCH_MINT_REVEAL"
  ) {
    return ContractKind.FOUNDATION_COLLECTION;
  }
  if (value) return ContractKind.IMPORTED;

  return ContractKind.UNKNOWN;
}

export function crawlerTypePriority(input: string | null | undefined) {
  const value = (input ?? "").toUpperCase();

  if (
    value === "FND" ||
    value === "FND_COLLECTION" ||
    value === "LIMITED_EDITION"
  ) {
    return 0;
  }

  if (value === "FND_BATCH_MINT_REVEAL") {
    return 2;
  }

  return 1;
}
