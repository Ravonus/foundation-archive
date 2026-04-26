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
  timeoutMs,
}: {
  bridgeUrl: string;
  path: string;
  init: RequestInit;
  fallback: string;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutHandle =
    typeof window !== "undefined" && timeoutMs
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const response = await fetch(`${trimTrailingSlash(bridgeUrl)}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
    });

    if (!response.ok) {
      throw new Error(await parseBridgeError(response, fallback));
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Desktop app timed out before responding.");
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      window.clearTimeout(timeoutHandle);
    }
  }
}
