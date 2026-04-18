import type { BridgeSession } from "../types";

export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

export function withJsonHeaders(body: unknown) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  } satisfies RequestInit;
}

export function safeParseSession(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as BridgeSession;
  } catch {
    return null;
  }
}

export async function parseBridgeError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;

  return payload?.error ?? payload?.message ?? fallback;
}

export async function requestBridgeJson<T>({
  bridgeUrl,
  path,
  init,
  fallback,
}: {
  bridgeUrl: string;
  path: string;
  init: RequestInit;
  fallback: string;
}) {
  const response = await fetch(`${trimTrailingSlash(bridgeUrl)}${path}`, init);

  if (!response.ok) {
    throw new Error(await parseBridgeError(response, fallback));
  }

  return (await response.json()) as T;
}
