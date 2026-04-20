import { env } from "~/env";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

type CfResponse<T> = {
  success: boolean;
  errors: { code: number; message: string }[];
  messages: unknown[];
  result: T;
};

function requireCloudflareConfig() {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const domain = env.CLOUDFLARE_TUNNEL_DOMAIN;

  if (!token || !accountId || !zoneId || !domain) {
    throw new Error(
      "Cloudflare tunnel provisioning is not configured. Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID, and CLOUDFLARE_TUNNEL_DOMAIN.",
    );
  }

  return { token, accountId, zoneId, domain };
}

async function cf<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${CF_API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const raw = (await response.json()) as CfResponse<T>;

  if (!raw.success) {
    const detail = raw.errors?.map((error) => `${error.code}: ${error.message}`).join(", ") ??
      `HTTP ${response.status}`;
    throw new Error(`Cloudflare API error (${path}): ${detail}`);
  }

  return raw.result;
}

type CreateTunnelResult = {
  id: string;
  name: string;
  token: string;
};

export async function createNamedTunnel(name: string): Promise<CreateTunnelResult> {
  const { token, accountId } = requireCloudflareConfig();

  const tunnelSecret = generateTunnelSecret();

  const created = await cf<{ id: string; name: string }>(
    token,
    `/accounts/${accountId}/cfd_tunnel`,
    {
      method: "POST",
      body: {
        name,
        tunnel_secret: tunnelSecret,
        config_src: "cloudflare",
      },
    },
  );

  const tokenResult = await cf<string>(
    token,
    `/accounts/${accountId}/cfd_tunnel/${created.id}/token`,
  );

  return {
    id: created.id,
    name: created.name,
    token: tokenResult,
  };
}

export type TunnelIngressRule = {
  hostname: string;
  service: string;
};

/**
 * Set ingress rules for a cloudflared named tunnel. One tunnel can serve
 * multiple hostnames by listing multiple ingress entries — used to expose
 * both the HTTP gateway and the libp2p WSS listener on separate subdomains.
 * The `http_status:404` catch-all is appended automatically.
 */
export async function setTunnelIngress(
  tunnelId: string,
  rules: TunnelIngressRule[],
): Promise<void> {
  const { token, accountId } = requireCloudflareConfig();

  if (rules.length === 0) {
    throw new Error("setTunnelIngress requires at least one rule.");
  }

  await cf(
    token,
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    {
      method: "PUT",
      body: {
        config: {
          ingress: [
            ...rules.map((rule) => ({
              hostname: rule.hostname,
              service: rule.service,
            })),
            { service: "http_status:404" },
          ],
        },
      },
    },
  );
}

export async function deleteTunnel(tunnelId: string): Promise<void> {
  const { token, accountId } = requireCloudflareConfig();

  await cf(
    token,
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}?cascade=true`,
    { method: "DELETE" },
  );
}

type DnsRecordResult = { id: string; name: string };

export async function createTunnelDnsRecord(
  subdomain: string,
  tunnelId: string,
): Promise<DnsRecordResult> {
  const { token, zoneId, domain } = requireCloudflareConfig();

  return cf<DnsRecordResult>(token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: {
      type: "CNAME",
      name: subdomain,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      comment: `foundation-archive tunnel for ${subdomain}.${domain}`,
    },
  });
}

export async function deleteDnsRecord(recordId: string): Promise<void> {
  const { token, zoneId } = requireCloudflareConfig();

  await cf(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

export function tunnelDomain(): string {
  return requireCloudflareConfig().domain;
}

function generateTunnelSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
