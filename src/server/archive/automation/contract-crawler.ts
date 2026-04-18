import { archiveIngressGuardForPendingJobs } from "~/lib/archive-pace";
import { getRpcClient } from "~/server/archive/chains";
import { fetchFoundationWorksByCollection } from "~/server/archive/foundation-api";
import { emitArchiveEvent } from "~/server/archive/live-events";
import {
  enqueueContractTokenIngest,
  persistDiscoveredFoundationWorks,
} from "~/server/archive/jobs";
import { discoverTokenIdsFromLogs } from "~/server/archive/jobs/ethereum-rpc";
import { getArchivePolicyState } from "~/server/archive/state";

import {
  API_REVISIT_INTERVAL_MS,
  crawlerTypePriority,
  type DatabaseClient,
} from "./types";

type PolicyState = Awaited<ReturnType<typeof getArchivePolicyState>>;
type BacklogState = ReturnType<typeof archiveIngressGuardForPendingJobs>;
type CrawlerCandidate = Awaited<
  ReturnType<DatabaseClient["contractCrawlerState"]["findMany"]>
>[number] & {
  contract: Awaited<
    ReturnType<DatabaseClient["contractRegistry"]["findUniqueOrThrow"]>
  >;
};

function disabledCrawlerResult() {
  return {
    scannedContracts: 0,
    queuedTokens: 0,
    pausedForBacklog: false,
    backlogMaxPendingJobs: 0,
    backlogHeadroomJobs: 0,
    allowedCrawlerContracts: 0,
  };
}

async function handleCrawlerBacklogPause({
  client,
  policy,
  backlog,
}: {
  client: DatabaseClient;
  policy: PolicyState;
  backlog: BacklogState;
}) {
  await client.archivePolicyState.update({
    where: { id: policy.id },
    data: {
      lastCrawlerTickAt: new Date(),
    },
  });

  return {
    scannedContracts: 0,
    queuedTokens: 0,
    pausedForBacklog: true,
    backlogMaxPendingJobs: backlog.maxPendingJobs,
    backlogHeadroomJobs: backlog.pendingHeadroom,
    allowedCrawlerContracts: backlog.allowedCrawlerContracts,
  };
}

function sortAndSliceCrawlers(
  crawlers: CrawlerCandidate[],
  allowedCrawlerContracts: number,
): CrawlerCandidate[] {
  return crawlers
    .sort((left, right) => {
      const priorityGap =
        crawlerTypePriority(left.contract.foundationContractType) -
        crawlerTypePriority(right.contract.foundationContractType);

      if (priorityGap !== 0) {
        return priorityGap;
      }

      const leftLastRun = left.lastRunFinishedAt?.getTime() ?? 0;
      const rightLastRun = right.lastRunFinishedAt?.getTime() ?? 0;

      if (leftLastRun !== rightLastRun) {
        return leftLastRun - rightLastRun;
      }

      return left.updatedAt.getTime() - right.updatedAt.getTime();
    })
    .slice(0, allowedCrawlerContracts);
}

function sortDueRevisitCrawlers(
  crawlers: CrawlerCandidate[],
  allowedCrawlerContracts: number,
): CrawlerCandidate[] {
  return crawlers
    .sort((left, right) => {
      const emptyGap =
        Number(left.totalDiscoveredCount > 0) -
        Number(right.totalDiscoveredCount > 0);

      if (emptyGap !== 0) {
        return emptyGap;
      }

      const nativeGap =
        Number(!left.contract.isFoundationNative) -
        Number(!right.contract.isFoundationNative);

      if (nativeGap !== 0) {
        return nativeGap;
      }

      const priorityGap =
        crawlerTypePriority(left.contract.foundationContractType) -
        crawlerTypePriority(right.contract.foundationContractType);

      if (priorityGap !== 0) {
        return priorityGap;
      }

      const leftLastRun = left.lastRunFinishedAt?.getTime() ?? 0;
      const rightLastRun = right.lastRunFinishedAt?.getTime() ?? 0;

      if (leftLastRun !== rightLastRun) {
        return leftLastRun - rightLastRun;
      }

      return left.updatedAt.getTime() - right.updatedAt.getTime();
    })
    .slice(0, allowedCrawlerContracts);
}

function crawlerCandidateSampleSize(allowedCrawlerContracts: number) {
  return Math.max(allowedCrawlerContracts * 24, 96);
}

async function selectUnfinishedCrawlerCandidates({
  client,
  sampleSize,
}: {
  client: DatabaseClient;
  sampleSize: number;
}) {
  return client.contractCrawlerState.findMany({
    where: {
      autoEnabled: true,
      completed: false,
    },
    include: {
      contract: true,
    },
    orderBy: [{ lastRunFinishedAt: "asc" }, { updatedAt: "asc" }],
    take: sampleSize,
  });
}

async function selectDueRevisitCrawlerCandidates({
  client,
  revisitThreshold,
  sampleSize,
}: {
  client: DatabaseClient;
  revisitThreshold: Date;
  sampleSize: number;
}) {
  return client.contractCrawlerState.findMany({
    where: {
      autoEnabled: true,
      completed: true,
      OR: [
        {
          lastRunFinishedAt: null,
        },
        {
          lastRunFinishedAt: {
            lte: revisitThreshold,
          },
        },
      ],
    },
    include: {
      contract: true,
    },
    orderBy: [{ lastRunFinishedAt: "asc" }, { updatedAt: "asc" }],
    take: sampleSize,
  });
}

async function selectCrawlerCandidates({
  client,
  backlog,
}: {
  client: DatabaseClient;
  backlog: BacklogState;
}) {
  const revisitThreshold = new Date(Date.now() - API_REVISIT_INTERVAL_MS);
  const sampleSize = crawlerCandidateSampleSize(backlog.allowedCrawlerContracts);
  const [unfinishedCandidates, dueRevisitCandidates] = await Promise.all([
    selectUnfinishedCrawlerCandidates({
      client,
      sampleSize,
    }),
    selectDueRevisitCrawlerCandidates({
      client,
      revisitThreshold,
      sampleSize,
    }),
  ]);

  const selected: CrawlerCandidate[] = [];
  const unfinished = sortAndSliceCrawlers(
    unfinishedCandidates,
    backlog.allowedCrawlerContracts,
  );
  const dueRevisits = sortDueRevisitCrawlers(
    dueRevisitCandidates,
    backlog.allowedCrawlerContracts,
  );

  const firstDueRevisit = dueRevisits[0];

  if (firstDueRevisit) {
    selected.push(firstDueRevisit);
  }

  const unfinishedSlotsRemaining =
    backlog.allowedCrawlerContracts - selected.length;

  if (unfinishedSlotsRemaining > 0) {
    selected.push(...unfinished.slice(0, unfinishedSlotsRemaining));
  }

  const revisitSlotsRemaining =
    backlog.allowedCrawlerContracts - selected.length;

  if (revisitSlotsRemaining <= 0) {
    return selected;
  }

  const selectedIds = new Set(selected.map((crawler) => crawler.id));

  selected.push(
    ...dueRevisits
      .filter((crawler) => !selectedIds.has(crawler.id))
      .slice(0, revisitSlotsRemaining),
  );

  return selected;
}

function apiScanSummary(input: {
  label: string;
  trackedWorks: number;
  page: number;
}) {
  return input.trackedWorks > 0
    ? `${input.label} tracked ${input.trackedWorks} IPFS work${input.trackedWorks === 1 ? "" : "s"} from page ${input.page}.`
    : `${input.label} checked page ${input.page} with no new works.`;
}

async function runApiCrawlerForContract({
  client,
  crawler,
  policy,
  runStartedAt,
}: {
  client: DatabaseClient;
  crawler: CrawlerCandidate;
  policy: PolicyState;
  runStartedAt: Date;
}) {
  const page = crawler.completed ? 0 : crawler.nextFromBlock;
  const works = await fetchFoundationWorksByCollection(
    crawler.contract.address,
    page,
    policy.discoveryPerPage,
  );

  await persistDiscoveredFoundationWorks(client, works, {
    indexedFrom: "foundation-contract-api",
    queueImmediately: false,
  });

  const completed = works.length < policy.discoveryPerPage;
  const nextPage = completed ? 0 : page + 1;

  await client.contractCrawlerState.update({
    where: { id: crawler.id },
    data: {
      nextFromBlock: nextPage,
      lastScannedBlock: page,
      completed,
      totalDiscoveredCount: {
        increment: works.length,
      },
      lastDiscoveredCount: works.length,
      lastRunFinishedAt: new Date(),
      lastError: null,
    },
  });

  await client.contractRegistry.update({
    where: { id: crawler.contract.id },
    data: {
      lastScanRequestedAt: runStartedAt,
      lastScanCompletedAt: new Date(),
    },
  });

  await emitArchiveEvent(client, {
    type: "crawler.contract-scan-progress",
    summary: apiScanSummary({
      label: crawler.contract.label,
      trackedWorks: works.length,
      page,
    }),
    contractAddress: crawler.contract.address,
    data: {
      contractLabel: crawler.contract.label,
      contractKind: crawler.contract.contractKind,
      scanMode: "api",
      page,
      trackedWorks: works.length,
      foundationUrls: works.map((work) => work.foundationUrl),
      nextPage,
      completed,
    },
  });

  return { scanned: 1, queuedTokens: works.length };
}

async function handleEmptyBlockRange({
  client,
  crawler,
}: {
  client: DatabaseClient;
  crawler: CrawlerCandidate;
}) {
  await client.contractCrawlerState.update({
    where: { id: crawler.id },
    data: {
      completed: crawler.scanToBlock !== null,
      lastRunStartedAt: new Date(),
      lastRunFinishedAt: new Date(),
      lastError: null,
    },
  });
}

function blockScanSummary(input: {
  label: string;
  tokenCount: number;
  startBlock: number;
  toBlock: number;
}) {
  return input.tokenCount > 0
    ? `${input.label} found ${input.tokenCount} token${input.tokenCount === 1 ? "" : "s"} in blocks ${input.startBlock}-${input.toBlock}.`
    : `${input.label} checked blocks ${input.startBlock}-${input.toBlock} with no new tokens.`;
}

async function enqueueBlockTokens({
  client,
  crawler,
  tokenIds,
}: {
  client: DatabaseClient;
  crawler: CrawlerCandidate;
  tokenIds: string[];
}) {
  for (const tokenId of tokenIds) {
    await enqueueContractTokenIngest(client, {
      chainId: crawler.contract.chainId,
      contractAddress: crawler.contract.address,
      tokenId,
    });
  }
}

async function persistBlockScanResult({
  client,
  crawler,
  tokenIds,
  startBlock,
  toBlock,
  upperBound,
  runStartedAt,
}: {
  client: DatabaseClient;
  crawler: CrawlerCandidate;
  tokenIds: string[];
  startBlock: number;
  toBlock: number;
  upperBound: number;
  runStartedAt: Date;
}) {
  await client.contractCrawlerState.update({
    where: { id: crawler.id },
    data: {
      nextFromBlock: toBlock + 1,
      lastScannedBlock: toBlock,
      completed:
        crawler.scanToBlock !== null ? toBlock >= upperBound : false,
      totalDiscoveredCount: {
        increment: tokenIds.length,
      },
      lastDiscoveredCount: tokenIds.length,
      lastRunFinishedAt: new Date(),
      lastError: null,
    },
  });

  await client.contractRegistry.update({
    where: { id: crawler.contract.id },
    data: {
      lastScanRequestedAt: runStartedAt,
      lastScanCompletedAt: new Date(),
    },
  });

  await emitArchiveEvent(client, {
    type: "crawler.contract-scan-progress",
    summary: blockScanSummary({
      label: crawler.contract.label,
      tokenCount: tokenIds.length,
      startBlock,
      toBlock,
    }),
    contractAddress: crawler.contract.address,
    data: {
      contractLabel: crawler.contract.label,
      contractKind: crawler.contract.contractKind,
      scanMode: "blocks",
      fromBlock: startBlock,
      toBlock,
      discoveredTokenIds: tokenIds,
      queuedTokens: tokenIds.length,
      nextFromBlock: toBlock + 1,
    },
  });
}

async function runBlockCrawlerForContract({
  client,
  crawler,
  latestBlock,
  runStartedAt,
}: {
  client: DatabaseClient;
  crawler: CrawlerCandidate;
  latestBlock: number;
  runStartedAt: Date;
}) {
  const startBlock = crawler.nextFromBlock || crawler.scanFromBlock;
  const upperBound = crawler.scanToBlock ?? latestBlock;

  if (startBlock > upperBound) {
    await handleEmptyBlockRange({ client, crawler });
    return { scanned: 0, queuedTokens: 0 };
  }

  const toBlock = Math.min(
    startBlock + crawler.blockWindowSize - 1,
    upperBound,
    latestBlock,
  );

  const tokenIds = await discoverTokenIdsFromLogs({
    chainId: crawler.contract.chainId,
    contractAddress: crawler.contract.address,
    fromBlock: startBlock,
    toBlock,
  });

  await enqueueBlockTokens({ client, crawler, tokenIds });

  await persistBlockScanResult({
    client,
    crawler,
    tokenIds,
    startBlock,
    toBlock,
    upperBound,
    runStartedAt,
  });

  return { scanned: 1, queuedTokens: tokenIds.length };
}

async function recordCrawlerFailure({
  client,
  crawler,
  error,
}: {
  client: DatabaseClient;
  crawler: CrawlerCandidate;
  error: unknown;
}) {
  const message =
    error instanceof Error ? error.message : "Unknown crawler failure";

  await client.contractCrawlerState.update({
    where: { id: crawler.id },
    data: {
      lastRunFinishedAt: new Date(),
      lastError: message,
    },
  });

  await emitArchiveEvent(client, {
    type: "crawler.contract-scan-failed",
    summary: `${crawler.contract.label} scan failed: ${message}`,
    contractAddress: crawler.contract.address,
    data: {
      contractLabel: crawler.contract.label,
      scanMode: crawler.scanMode,
      error: message,
    },
  });
}

async function ensureLatestBlock(
  chainId: number,
  latestBlockByChain: Map<number, number>,
) {
  const cached = latestBlockByChain.get(chainId);
  if (cached !== undefined) return cached;
  const tip = Number(await getRpcClient(chainId).getBlockNumber());
  latestBlockByChain.set(chainId, tip);
  return tip;
}

async function runSingleCrawler({
  client,
  crawler,
  policy,
  latestBlockByChain,
}: {
  client: DatabaseClient;
  crawler: CrawlerCandidate;
  policy: PolicyState;
  latestBlockByChain: Map<number, number>;
}) {
  const runStartedAt = new Date();

  await client.contractCrawlerState.update({
    where: { id: crawler.id },
    data: {
      lastRunStartedAt: runStartedAt,
      lastError: null,
    },
  });

  try {
    if (crawler.scanMode === "api") {
      return await runApiCrawlerForContract({
        client,
        crawler,
        policy,
        runStartedAt,
      });
    }

    const latestBlock = await ensureLatestBlock(
      crawler.contract.chainId,
      latestBlockByChain,
    );

    return await runBlockCrawlerForContract({
      client,
      crawler,
      latestBlock,
      runStartedAt,
    });
  } catch (error) {
    await recordCrawlerFailure({ client, crawler, error });
    return { scanned: 0, queuedTokens: 0 };
  }
}

async function runCrawlerLoop({
  client,
  crawlers,
  policy,
}: {
  client: DatabaseClient;
  crawlers: CrawlerCandidate[];
  policy: PolicyState;
}) {
  let scannedContracts = 0;
  let queuedTokens = 0;
  const latestBlockByChain = new Map<number, number>();

  for (const crawler of crawlers) {
    const result = await runSingleCrawler({
      client,
      crawler,
      policy,
      latestBlockByChain,
    });
    scannedContracts += result.scanned;
    queuedTokens += result.queuedTokens;
  }

  return { scannedContracts, queuedTokens };
}

export async function runAutomaticContractCrawlerTick(
  client: DatabaseClient,
) {
  const policy = await getArchivePolicyState(client);
  if (!policy.autoCrawlerEnabled) {
    return disabledCrawlerResult();
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

  if (backlog.pauseIngress || backlog.allowedCrawlerContracts <= 0) {
    return handleCrawlerBacklogPause({ client, policy, backlog });
  }

  const crawlers = await selectCrawlerCandidates({ client, backlog });

  const { scannedContracts, queuedTokens } = await runCrawlerLoop({
    client,
    crawlers,
    policy,
  });

  await client.archivePolicyState.update({
    where: { id: policy.id },
    data: {
      lastCrawlerTickAt: new Date(),
    },
  });

  return {
    scannedContracts,
    queuedTokens,
    pausedForBacklog: false,
    backlogMaxPendingJobs: backlog.maxPendingJobs,
    backlogHeadroomJobs: backlog.pendingHeadroom,
    allowedCrawlerContracts: backlog.allowedCrawlerContracts,
  };
}
