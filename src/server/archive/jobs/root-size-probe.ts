import { env } from "~/env";

export type SizeProbeRoot = {
  cid: string;
  relativePath: string | null;
  gatewayUrl: string | null;
  originalUrl: string | null;
  mimeType: string | null;
  byteSize: number | null;
  estimatedByteSize: number | null;
};

const SIZE_PROBE_TIMEOUT_MS = 2_500;
const SIZE_PROBE_USER_AGENT = "foundation-archive/0.1 (+ipfs-size-probe)";
const PUBLIC_SIZE_PROBE_GATEWAYS = [
  "https://ipfs.io",
  "https://dweb.link",
  "https://nftstorage.link",
  "https://4everland.io",
] as const;
const DEFAULT_IPFS_GATEWAY_BASE_URL = "https://ipfs.io";

function parsePositiveByteSize(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function contentRangeByteSize(value: string | null) {
  if (!value) return null;
  const match = /\/(\d+|\*)$/u.exec(value.trim());
  return match?.[1] && match[1] !== "*"
    ? parsePositiveByteSize(match[1])
    : null;
}

function responseHeaderByteSize(response: Response) {
  return (
    parsePositiveByteSize(response.headers.get("content-length")) ??
    contentRangeByteSize(response.headers.get("content-range"))
  );
}

function kuboGatewayUrlFor(root: SizeProbeRoot) {
  const pathSuffix = root.relativePath
    ? `/${root.relativePath.replace(/^\/+/, "")}`
    : "";
  const configuredGateway = env.KUBO_GATEWAY_URL;

  if (configuredGateway) {
    return `${configuredGateway.replace(/\/+$/u, "")}/ipfs/${root.cid}${pathSuffix}`;
  }

  if (!env.KUBO_API_URL) return null;

  try {
    const kuboGateway = new URL(env.KUBO_API_URL);
    kuboGateway.port = "8080";
    kuboGateway.pathname = `/ipfs/${root.cid}${pathSuffix}`;
    kuboGateway.search = "";
    return kuboGateway.toString();
  } catch {
    return null;
  }
}

function gatewayUrlFor(root: SizeProbeRoot, gatewayBase: string) {
  const pathSuffix = root.relativePath
    ? `/${root.relativePath.replace(/^\/+/, "")}`
    : "";

  return `${gatewayBase.replace(/\/+$/u, "")}/ipfs/${root.cid}${pathSuffix}`;
}

function isHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function configuredPublicGatewayBaseUrl() {
  const configured = process.env.IPFS_GATEWAY_BASE_URL?.trim();
  if (configured) return configured;
  return DEFAULT_IPFS_GATEWAY_BASE_URL;
}

function sizeProbeUrls(root: SizeProbeRoot) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined) => {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed) || !isHttpUrl(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  };

  push(kuboGatewayUrlFor(root));
  push(root.gatewayUrl);
  push(root.originalUrl);
  push(gatewayUrlFor(root, configuredPublicGatewayBaseUrl()));
  for (const gateway of PUBLIC_SIZE_PROBE_GATEWAYS) {
    push(gatewayUrlFor(root, gateway));
  }

  return urls;
}

function probeSignal(parentSignal: AbortSignal | null) {
  const timeoutSignal = AbortSignal.timeout(SIZE_PROBE_TIMEOUT_MS);
  if (!parentSignal) return timeoutSignal;
  return AbortSignal.any([parentSignal, timeoutSignal]);
}

async function fetchSizeProbe(
  url: string,
  method: "HEAD" | "GET",
  parentSignal: AbortSignal | null,
) {
  const headers: Record<string, string> = {
    "user-agent": SIZE_PROBE_USER_AGENT,
  };

  if (method === "GET") {
    headers.range = "bytes=0-0";
  }

  const response = await fetch(url, {
    method,
    headers,
    signal: probeSignal(parentSignal),
  });

  if (!response.ok && response.status !== 206) {
    return null;
  }

  const estimatedByteSize = responseHeaderByteSize(response);
  if (!estimatedByteSize) return null;

  return {
    estimatedByteSize,
    mimeType: response.headers.get("content-type"),
  };
}

async function probeRootUrlSize(url: string, signal: AbortSignal | null) {
  try {
    const head = await fetchSizeProbe(url, "HEAD", signal);
    if (head) return head;
  } catch {
    // A one-byte range probe still exposes Content-Range on gateways
    // that omit content-length on HEAD.
  }

  try {
    return await fetchSizeProbe(url, "GET", signal);
  } catch {
    return null;
  }
}

function firstSuccessfulProbe(urls: string[]) {
  if (urls.length === 0) return Promise.resolve(null);

  return new Promise<Awaited<ReturnType<typeof probeRootUrlSize>>>(
    (resolve) => {
      const controller = new AbortController();
      let settled = false;
      let remaining = urls.length;

      for (const url of urls) {
        void probeRootUrlSize(url, controller.signal)
          .then((result) => {
            if (settled || !result) return;
            settled = true;
            controller.abort();
            resolve(result);
          })
          .catch(() => null)
          .finally(() => {
            remaining -= 1;
            if (!settled && remaining === 0) {
              settled = true;
              controller.abort();
              resolve(null);
            }
          });
      }
    },
  );
}

export async function probeRootSize(root: SizeProbeRoot) {
  const existingSize = root.byteSize ?? root.estimatedByteSize ?? null;
  if (existingSize) {
    return {
      estimatedByteSize: existingSize,
      mimeType: root.mimeType,
    };
  }

  const result = await firstSuccessfulProbe(sizeProbeUrls(root));
  if (result) {
    return {
      estimatedByteSize: result.estimatedByteSize,
      mimeType: result.mimeType ?? root.mimeType,
    };
  }

  return {
    estimatedByteSize: null as number | null,
    mimeType: root.mimeType,
  };
}
