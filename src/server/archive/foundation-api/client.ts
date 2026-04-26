import { env } from "~/env";
import { RootKind } from "~/server/prisma-client";
import { firstIpfsReference } from "~/server/archive/ipfs";
import { foundationGraphqlEnvelopeSchema } from "./schemas";
import { type FoundationLookupWork, type WorkStorageProtocol } from "./types";

export function normalizeUsername(query: string) {
  return query.trim().replace(/^@+/, "");
}

export function workKey(contractAddress: string, tokenId: string) {
  return `${contractAddress.toLowerCase()}:${tokenId}`;
}

export function isFoundationWorkIpfsArchivable(
  work: Pick<FoundationLookupWork, "metadataUrl" | "sourceUrl" | "mediaUrl">,
) {
  return Boolean(
    firstIpfsReference(RootKind.METADATA, [work.metadataUrl]) ??
    firstIpfsReference(RootKind.MEDIA, [work.sourceUrl, work.mediaUrl]),
  );
}

export function filterIpfsWorks(works: FoundationLookupWork[]) {
  return works.filter((work) => isFoundationWorkIpfsArchivable(work));
}

function isArweaveUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("ar://") ||
    /(^|\/\/)([^/]+\.)?arweave\.net/i.test(trimmed)
  );
}

function isInlineDataUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim().toLowerCase().startsWith("data:"));
}

function isCentralizedHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed);
}

export function detectWorkStorageProtocol(
  work: Pick<FoundationLookupWork, "metadataUrl" | "sourceUrl" | "mediaUrl">,
): WorkStorageProtocol {
  if (isFoundationWorkIpfsArchivable(work)) return "ipfs";

  const urls = [work.metadataUrl, work.sourceUrl, work.mediaUrl];
  if (urls.some(isArweaveUrl)) return "arweave";
  if (urls.some(isInlineDataUrl)) return "inline";
  if (urls.some(isCentralizedHttpUrl)) return "centralized";
  return "unknown";
}

export async function fetchFoundationGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await fetch(env.FOUNDATION_GRAPHQL_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "foundation-archive/0.1 (+https://foundation.app)",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Foundation API request failed: ${response.status}`);
  }

  const envelope = foundationGraphqlEnvelopeSchema.parse(
    (await response.json()) as unknown,
  );

  if (envelope.errors?.length) {
    throw new Error(envelope.errors.map((error) => error.message).join("; "));
  }

  return envelope.data as T;
}
