import { env } from "~/env";
import { RootKind } from "~/server/prisma-client";
import { firstIpfsReference } from "~/server/archive/ipfs";
import { foundationGraphqlEnvelopeSchema } from "./schemas";
import { type FoundationLookupWork } from "./types";

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
