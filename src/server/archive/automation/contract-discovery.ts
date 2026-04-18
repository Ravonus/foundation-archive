import { archiveIngressGuardForPendingJobs } from "~/lib/archive-pace";
import {
  fetchFoundationDropCollectionsPage,
  fetchFoundationEditionCollectionsPage,
  searchFoundationCollectionsPage,
} from "~/server/archive/foundation-api";
import { emitArchiveEvent } from "~/server/archive/live-events";
import { getArchivePolicyState } from "~/server/archive/state";

import {
  ensureAutoCrawlerContracts,
  upsertAutoDiscoveredContract,
} from "./auto-discovered-upserts";
import {
  activeCollectionDiscoveryQuery,
  COLLECTION_DISCOVERY_TERMS,
  type DatabaseClient,
  type DiscoverySource,
} from "./types";

type PolicyState = Awaited<ReturnType<typeof getArchivePolicyState>>;
type BacklogState = ReturnType<typeof archiveIngressGuardForPendingJobs>;
type DiscoveryPageResult = Awaited<ReturnType<typeof fetchDiscoveryPage>>;

function normalizeDiscoverySource(source: string): DiscoverySource {
  return (
    ["drops", "editions", "collections"].includes(source) ? source : "editions"
  ) as DiscoverySource;
}

async function fetchDropsDiscoveryPage(input: {
  discoveryPage: number;
  discoveryPerPage: number;
}) {
  const page = await fetchFoundationDropCollectionsPage(
    input.discoveryPage,
    input.discoveryPerPage,
  );

  return {
    source: "drops" as const,
    page: input.discoveryPage,
    query: null,
    items: page.items,
    reachedEnd:
      page.items.length < input.discoveryPerPage ||
      (page.page + 1) * input.discoveryPerPage >= page.totalItems,
  };
}

async function fetchEditionsDiscoveryPage(input: {
  discoveryPage: number;
  discoveryPerPage: number;
}) {
  const page = await fetchFoundationEditionCollectionsPage(
    input.discoveryPage,
    input.discoveryPerPage,
  );

  return {
    source: "editions" as const,
    page: input.discoveryPage,
    query: null,
    items: page.items,
    reachedEnd:
      page.items.length < input.discoveryPerPage ||
      (page.page + 1) * input.discoveryPerPage >= page.totalItems,
  };
}

async function fetchCollectionsDiscoveryPage(input: {
  discoveryPage: number;
  discoveryPerPage: number;
  discoveryQueryIndex: number;
}) {
  const query = activeCollectionDiscoveryQuery(input.discoveryQueryIndex);
  const page = await searchFoundationCollectionsPage(
    query,
    input.discoveryPage,
    input.discoveryPerPage,
  );

  return {
    source: "collections" as const,
    page: input.discoveryPage,
    query,
    items: page.items,
    reachedEnd: page.items.length < input.discoveryPerPage,
  };
}

export async function fetchDiscoveryPage(input: {
  discoveryPage: number;
  discoveryPerPage: number;
  discoveryQueryIndex: number;
  discoverySource: string;
}) {
  const source = normalizeDiscoverySource(input.discoverySource);

  if (source === "drops") {
    return fetchDropsDiscoveryPage({
      discoveryPage: input.discoveryPage,
      discoveryPerPage: input.discoveryPerPage,
    });
  }

  if (source === "editions") {
    return fetchEditionsDiscoveryPage({
      discoveryPage: input.discoveryPage,
      discoveryPerPage: input.discoveryPerPage,
    });
  }

  return fetchCollectionsDiscoveryPage({
    discoveryPage: input.discoveryPage,
    discoveryPerPage: input.discoveryPerPage,
    discoveryQueryIndex: input.discoveryQueryIndex,
  });
}

export function nextDiscoveryCursor(input: {
  currentSource: string;
  currentQueryIndex: number;
  reachedEnd: boolean;
}) {
  const source = normalizeDiscoverySource(input.currentSource);

  if (!input.reachedEnd) {
    return {
      discoverySource: source,
      discoveryPageIncrement: 1,
      discoveryPage: null as number | null,
      discoveryQueryIndex: input.currentQueryIndex,
    };
  }

  if (source === "editions") {
    return {
      discoverySource: "collections" as const,
      discoveryPageIncrement: null,
      discoveryPage: 0,
      discoveryQueryIndex: input.currentQueryIndex,
    };
  }

  if (source === "drops") {
    return {
      discoverySource: "editions" as const,
      discoveryPageIncrement: null,
      discoveryPage: 0,
      discoveryQueryIndex: input.currentQueryIndex,
    };
  }

  const nextQueryIndex =
    (input.currentQueryIndex + 1) % COLLECTION_DISCOVERY_TERMS.length;
  const wrapped = nextQueryIndex === 0;

  return {
    discoverySource: wrapped ? ("drops" as const) : ("collections" as const),
    discoveryPageIncrement: null,
    discoveryPage: 0,
    discoveryQueryIndex: nextQueryIndex,
  };
}

function disabledDiscoveryResult(policy: PolicyState) {
  return {
    source: policy.discoverySource,
    page: policy.discoveryPage,
    query: null as string | null,
    seenContracts: 0,
    newContracts: 0,
    pausedForBacklog: false,
    backlogMaxPendingJobs: 0,
    backlogHeadroomJobs: 0,
  };
}

async function handleBacklogPause({
  client,
  policy,
  pendingJobs,
  backlog,
}: {
  client: DatabaseClient;
  policy: PolicyState;
  pendingJobs: number;
  backlog: BacklogState;
}) {
  await client.archivePolicyState.update({
    where: { id: policy.id },
    data: {
      lastDiscoveryTickAt: new Date(),
      lastDiscoverySummary: `Paused discovery while the backup queue drains (${pendingJobs}/${backlog.maxPendingJobs} pending jobs).`,
    },
  });

  return {
    source: policy.discoverySource,
    page: policy.discoveryPage,
    query:
      policy.discoverySource === "collections"
        ? activeCollectionDiscoveryQuery(policy.discoveryQueryIndex)
        : null,
    seenContracts: 0,
    newContracts: 0,
    pausedForBacklog: true,
    backlogMaxPendingJobs: backlog.maxPendingJobs,
    backlogHeadroomJobs: backlog.pendingHeadroom,
  };
}

function buildDiscoveryErrorSummary(input: {
  source: string;
  page: number;
  query: string | null;
  message: string;
}) {
  return input.source === "collections" && input.query
    ? `Skipped collections search "${input.query}" page ${input.page}: ${input.message}`
    : `Skipped ${input.source} page ${input.page}: ${input.message}`;
}

function buildDiscoveryErrorEventSummary(input: {
  source: string;
  page: number;
  query: string | null;
}) {
  return input.source === "collections" && input.query
    ? `Skipped Foundation collections "${input.query}" page ${input.page} after an API error.`
    : `Skipped Foundation ${input.source} page ${input.page} after an API error.`;
}

async function handleDiscoveryError({
  client,
  policy,
  error,
  backlog,
}: {
  client: DatabaseClient;
  policy: PolicyState;
  error: unknown;
  backlog: BacklogState;
}) {
  const message =
    error instanceof Error ? error.message : "Unknown discovery error";
  const query =
    policy.discoverySource === "collections"
      ? activeCollectionDiscoveryQuery(policy.discoveryQueryIndex)
      : null;
  const nextCursor = nextDiscoveryCursor({
    currentSource: policy.discoverySource,
    currentQueryIndex: policy.discoveryQueryIndex,
    reachedEnd: true,
  });
  const nextDiscoveryPage =
    nextCursor.discoveryPage ??
    policy.discoveryPage + (nextCursor.discoveryPageIncrement ?? 0);

  await client.archivePolicyState.update({
    where: { id: policy.id },
    data: {
      discoverySource: nextCursor.discoverySource,
      discoveryPage: nextDiscoveryPage,
      discoveryQueryIndex: nextCursor.discoveryQueryIndex,
      lastDiscoveryTickAt: new Date(),
      lastDiscoverySummary: buildDiscoveryErrorSummary({
        source: policy.discoverySource,
        page: policy.discoveryPage,
        query,
        message,
      }),
    },
  });

  await emitArchiveEvent(client, {
    type: "crawler.discovery-error",
    summary: buildDiscoveryErrorEventSummary({
      source: policy.discoverySource,
      page: policy.discoveryPage,
      query,
    }),
    data: {
      source: policy.discoverySource,
      page: policy.discoveryPage,
      query,
      error: message,
      nextSource: nextCursor.discoverySource,
      nextPage: nextDiscoveryPage,
      nextQueryIndex: nextCursor.discoveryQueryIndex,
    },
  });

  return {
    source: policy.discoverySource,
    page: policy.discoveryPage,
    query,
    seenContracts: 0,
    newContracts: 0,
    pausedForBacklog: false,
    backlogMaxPendingJobs: backlog.maxPendingJobs,
    backlogHeadroomJobs: backlog.pendingHeadroom,
  };
}

async function upsertDiscoveryItems({
  client,
  discovery,
}: {
  client: DatabaseClient;
  discovery: DiscoveryPageResult;
}) {
  let newContracts = 0;
  for (const discoveredContract of discovery.items) {
    const result = await upsertAutoDiscoveredContract({
      client,
      input: discoveredContract,
      source: discovery.source,
      query: discovery.query,
    });
    if (result.created) {
      newContracts += 1;
    }
  }
  return newContracts;
}

function buildDiscoveryProgressSummary(
  discovery: DiscoveryPageResult,
  newContracts: number,
) {
  const suffix = newContracts === 1 ? "" : "s";
  return discovery.source === "collections" && discovery.query
    ? `Foundation discovery checked "${discovery.query}" page ${discovery.page} and added ${newContracts} contract${suffix}.`
    : `Foundation discovery checked ${discovery.source} page ${discovery.page} and added ${newContracts} contract${suffix}.`;
}

function buildDiscoverySummary(discovery: DiscoveryPageResult) {
  return discovery.source === "collections" && discovery.query
    ? `Checked collections search "${discovery.query}" page ${discovery.page}.`
    : `Checked ${discovery.source} page ${discovery.page}.`;
}

async function persistDiscoveryProgress({
  client,
  policy,
  discovery,
  newContracts,
}: {
  client: DatabaseClient;
  policy: PolicyState;
  discovery: DiscoveryPageResult;
  newContracts: number;
}) {
  const nextCursor = nextDiscoveryCursor({
    currentSource: discovery.source,
    currentQueryIndex: policy.discoveryQueryIndex,
    reachedEnd: discovery.reachedEnd,
  });
  const nextDiscoveryPage =
    nextCursor.discoveryPage ??
    policy.discoveryPage + (nextCursor.discoveryPageIncrement ?? 0);

  const updatedPolicy = await client.archivePolicyState.update({
    where: { id: policy.id },
    data: {
      discoverySource: nextCursor.discoverySource,
      discoveryPage: nextDiscoveryPage,
      discoveryQueryIndex: nextCursor.discoveryQueryIndex,
      totalDiscoveredContracts: {
        increment: newContracts,
      },
      lastDiscoveryTickAt: new Date(),
      lastDiscoverySummary: buildDiscoverySummary(discovery),
    },
  });

  await emitArchiveEvent(client, {
    type: "crawler.discovery-progress",
    summary: buildDiscoveryProgressSummary(discovery, newContracts),
    data: {
      source: discovery.source,
      page: discovery.page,
      query: discovery.query,
      seenContracts: discovery.items.length,
      newContracts,
      nextSource: updatedPolicy.discoverySource,
      nextPage: updatedPolicy.discoveryPage,
      nextQueryIndex: updatedPolicy.discoveryQueryIndex,
      totalDiscoveredContracts: updatedPolicy.totalDiscoveredContracts,
    },
  });
}

export async function runAutomaticContractDiscoveryTick(
  client: DatabaseClient,
) {
  const policy = await getArchivePolicyState(client);
  if (!policy.autoCrawlerEnabled) {
    return disabledDiscoveryResult(policy);
  }

  const pendingJobs = await client.queueJob.count({
    where: {
      status: "PENDING",
    },
  });
  const backlog = archiveIngressGuardForPendingJobs(
    policy.contractsPerTick,
    pendingJobs,
    policy.discoveryPerPage,
  );

  if (backlog.pauseIngress) {
    return handleBacklogPause({ client, policy, pendingJobs, backlog });
  }

  await ensureAutoCrawlerContracts(client);

  let discovery: DiscoveryPageResult;
  try {
    discovery = await fetchDiscoveryPage({
      discoverySource: policy.discoverySource,
      discoveryPage: policy.discoveryPage,
      discoveryQueryIndex: policy.discoveryQueryIndex,
      discoveryPerPage: policy.discoveryPerPage,
    });
  } catch (error) {
    return handleDiscoveryError({ client, policy, error, backlog });
  }

  const newContracts = await upsertDiscoveryItems({ client, discovery });

  await persistDiscoveryProgress({
    client,
    policy,
    discovery,
    newContracts,
  });

  return {
    source: discovery.source,
    page: discovery.page,
    query: discovery.query,
    seenContracts: discovery.items.length,
    newContracts,
    pausedForBacklog: false,
    backlogMaxPendingJobs: backlog.maxPendingJobs,
    backlogHeadroomJobs: backlog.pendingHeadroom,
  };
}
