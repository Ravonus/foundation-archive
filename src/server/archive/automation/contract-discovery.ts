/* eslint-disable max-lines-per-function, @typescript-eslint/no-unnecessary-condition */

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
type DiscoveryUpsertResult = {
  newContracts: number;
  skippedContracts: number;
  sampleErrors: string[];
};

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
    completedFoundationPass: false,
    pausedForBacklog: false,
    backlogMaxPendingJobs: 0,
    backlogHeadroomJobs: 0,
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

function formatDiscoveryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown discovery error";
}

async function emitDiscoveryEventSafely(
  client: DatabaseClient,
  input: Parameters<typeof emitArchiveEvent>[1],
) {
  try {
    await emitArchiveEvent(client, input);
  } catch {
    // Discovery progress should keep moving even if live-event publishing is down.
  }
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
  const message = formatDiscoveryErrorMessage(error);
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

  await emitDiscoveryEventSafely(client, {
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
    completedFoundationPass: false,
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
  let skippedContracts = 0;
  const sampleErrors: string[] = [];

  for (const discoveredContract of discovery.items) {
    try {
      const result = await upsertAutoDiscoveredContract({
        client,
        input: discoveredContract,
        source: discovery.source,
        query: discovery.query,
      });
      if (result.created) {
        newContracts += 1;
      }
    } catch (error) {
      skippedContracts += 1;
      if (sampleErrors.length < 3) {
        sampleErrors.push(
          `${discoveredContract.contractAddress}: ${formatDiscoveryErrorMessage(error)}`,
        );
      }
    }
  }

  return {
    newContracts,
    skippedContracts,
    sampleErrors,
  } satisfies DiscoveryUpsertResult;
}

function buildDiscoveryProgressSummary(
  discovery: DiscoveryPageResult,
  newContracts: number,
  skippedContracts: number,
) {
  const suffix = newContracts === 1 ? "" : "s";
  const skippedSummary =
    skippedContracts > 0
      ? ` while skipping ${skippedContracts} bad entr${skippedContracts === 1 ? "y" : "ies"}`
      : "";
  return discovery.source === "collections" && discovery.query
    ? `Foundation discovery checked "${discovery.query}" page ${discovery.page} and added ${newContracts} contract${suffix}${skippedSummary}.`
    : `Foundation discovery checked ${discovery.source} page ${discovery.page} and added ${newContracts} contract${suffix}${skippedSummary}.`;
}

function buildDiscoverySummary(
  discovery: DiscoveryPageResult,
  skippedContracts: number,
) {
  const skippedSummary =
    skippedContracts > 0
      ? ` Skipped ${skippedContracts} bad entr${skippedContracts === 1 ? "y" : "ies"}.`
      : "";
  return discovery.source === "collections" && discovery.query
    ? `Checked collections search "${discovery.query}" page ${discovery.page}.${skippedSummary}`
    : `Checked ${discovery.source} page ${discovery.page}.${skippedSummary}`;
}

async function persistDiscoveryProgress({
  client,
  policy,
  discovery,
  newContracts,
  skippedContracts,
  sampleErrors,
  pagesConsumed = 1,
}: {
  client: DatabaseClient;
  policy: PolicyState;
  discovery: DiscoveryPageResult;
  newContracts: number;
  skippedContracts: number;
  sampleErrors: string[];
  /// How many consecutive pages this tick consumed. The old path
  /// processed one page per tick; batched discovery can burn through
  /// several in parallel and needs the cursor to skip ahead by that
  /// much.
  pagesConsumed?: number;
}) {
  const nextCursor = nextDiscoveryCursor({
    currentSource: discovery.source,
    currentQueryIndex: policy.discoveryQueryIndex,
    reachedEnd: discovery.reachedEnd,
  });
  const nextDiscoveryPage =
    nextCursor.discoveryPage ??
    policy.discoveryPage +
      (nextCursor.discoveryPageIncrement === null
        ? 0
        : (nextCursor.discoveryPageIncrement ?? 0) * pagesConsumed);
  const completedFoundationPass =
    nextCursor.discoverySource === "drops" &&
    nextDiscoveryPage === 0 &&
    nextCursor.discoveryQueryIndex === 0 &&
    discovery.reachedEnd;

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
      lastDiscoverySummary: buildDiscoverySummary(discovery, skippedContracts),
    },
  });

  await emitDiscoveryEventSafely(client, {
    type: "crawler.discovery-progress",
    summary: buildDiscoveryProgressSummary(
      discovery,
      newContracts,
      skippedContracts,
    ),
    data: {
      source: discovery.source,
      page: discovery.page,
      query: discovery.query,
      seenContracts: discovery.items.length,
      newContracts,
      skippedContracts,
      sampleErrors,
      nextSource: updatedPolicy.discoverySource,
      nextPage: updatedPolicy.discoveryPage,
      nextQueryIndex: updatedPolicy.discoveryQueryIndex,
      totalDiscoveredContracts: updatedPolicy.totalDiscoveredContracts,
    },
  });

  return {
    completedFoundationPass,
  };
}

// Pages fetched in parallel per tick. The old 1-page-per-tick pace
// meant a full pass over Foundation's ~4k collection pages took hours,
// which stalled the smart-pin budget ramp (it only advances when a
// full pass completes). 8 parallel GraphQL calls is well within
// Foundation's tolerance and cuts wall time ~8x.
const DISCOVERY_PAGES_PER_TICK = 8;

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

  try {
    await ensureAutoCrawlerContracts(client);
  } catch (error) {
    await emitDiscoveryEventSafely(client, {
      type: "crawler.discovery-seed-error",
      summary: "Skipped crawler seed sync after an internal error.",
      data: {
        error: formatDiscoveryErrorMessage(error),
      },
    });
  }

  // Kick off DISCOVERY_PAGES_PER_TICK pages in parallel. The first one
  // to hit reachedEnd truncates the batch, so we don't advance the
  // cursor past the end of the current source/query.
  const pagePromises: Promise<DiscoveryPageResult>[] = [];
  for (let i = 0; i < DISCOVERY_PAGES_PER_TICK; i += 1) {
    pagePromises.push(
      fetchDiscoveryPage({
        discoverySource: policy.discoverySource,
        discoveryPage: policy.discoveryPage + i,
        discoveryQueryIndex: policy.discoveryQueryIndex,
        discoveryPerPage: policy.discoveryPerPage,
      }),
    );
  }

  let discoveries: DiscoveryPageResult[];
  try {
    discoveries = await Promise.all(pagePromises);
  } catch (error) {
    return handleDiscoveryError({ client, policy, error, backlog });
  }

  // Truncate at the first page that reports reachedEnd, inclusive —
  // persistDiscoveryProgress needs to know when the source exhausts.
  let endIndex = discoveries.length;
  for (let i = 0; i < discoveries.length; i += 1) {
    const result = discoveries[i];
    if (result?.reachedEnd) {
      endIndex = i + 1;
      break;
    }
  }
  const batch = discoveries.slice(0, endIndex);

  let upsertResult: DiscoveryUpsertResult;
  let progressResult: { completedFoundationPass: boolean };
  const lastDiscovery = batch[batch.length - 1] ?? discoveries[0];
  if (!lastDiscovery) {
    // Should be impossible — DISCOVERY_PAGES_PER_TICK > 0 — but keep
    // the type-checker happy and the worker stable.
    return {
      source: policy.discoverySource,
      page: policy.discoveryPage,
      query: null,
      seenContracts: 0,
      newContracts: 0,
      completedFoundationPass: false,
      pausedForBacklog: false,
      backlogMaxPendingJobs: backlog.maxPendingJobs,
      backlogHeadroomJobs: backlog.pendingHeadroom,
    };
  }
  try {
    // Fold all batch pages into one upsert + one cursor advance so the
    // DB doesn't see N writes per tick.
    const combined: DiscoveryPageResult = {
      ...lastDiscovery,
      items: batch.flatMap((page) => page.items),
    };
    upsertResult = await upsertDiscoveryItems({
      client,
      discovery: combined,
    });
    progressResult = await persistDiscoveryProgress({
      client,
      policy,
      discovery: combined,
      newContracts: upsertResult.newContracts,
      skippedContracts: upsertResult.skippedContracts,
      sampleErrors: upsertResult.sampleErrors,
      pagesConsumed: batch.length,
    });
  } catch (error) {
    return handleDiscoveryError({ client, policy, error, backlog });
  }

  return {
    source: lastDiscovery.source,
    page: lastDiscovery.page,
    query: lastDiscovery.query,
    seenContracts: batch.reduce((sum, page) => sum + page.items.length, 0),
    newContracts: upsertResult.newContracts,
    completedFoundationPass: progressResult.completedFoundationPass,
    pausedForBacklog: false,
    backlogMaxPendingJobs: backlog.maxPendingJobs,
    backlogHeadroomJobs: backlog.pendingHeadroom,
  };
}
