export type PinHostKind = "PSA" | "KUBO_RPC";
export type PinHostAuthMode = "NONE" | "BEARER" | "BASIC" | "CUSTOM_HEADER";

export type PinHostPreset = {
  id: string;
  label: string;
  description: string;
  kind: PinHostKind;
  endpointUrl: string;
  publicGatewayUrl: string;
  authMode: PinHostAuthMode;
  authHeaderName: string;
};

export const PIN_HOST_PRESETS: PinHostPreset[] = [
  {
    id: "pinata",
    label: "Pinata",
    description:
      "Popular hosted IPFS pinning with a JWT token and Pinata's pinByHash API.",
    kind: "PSA",
    endpointUrl: "https://api.pinata.cloud/psa",
    publicGatewayUrl: "https://gateway.pinata.cloud/ipfs",
    authMode: "BEARER",
    authHeaderName: "Authorization",
  },
  {
    id: "filebase",
    label: "Filebase",
    description:
      "S3-style object storage with an IPFS pinning API endpoint for existing CIDs.",
    kind: "PSA",
    endpointUrl: "https://api.filebase.io/v1/ipfs",
    publicGatewayUrl: "https://ipfs.filebase.io/ipfs",
    authMode: "BEARER",
    authHeaderName: "Authorization",
  },
  {
    id: "generic-psa",
    label: "Generic Pinning API",
    description:
      "Any provider that supports the IPFS Pinning Service API or a compatible /pins endpoint.",
    kind: "PSA",
    endpointUrl: "https://example.com/pins",
    publicGatewayUrl: "https://example.com/ipfs",
    authMode: "BEARER",
    authHeaderName: "Authorization",
  },
  {
    id: "kubo-rpc",
    label: "Self-hosted Kubo",
    description:
      "A personal or hosted Kubo RPC endpoint that can pin existing IPFS roots directly.",
    kind: "KUBO_RPC",
    endpointUrl: "http://127.0.0.1:5001",
    publicGatewayUrl: "http://127.0.0.1:8080/ipfs",
    authMode: "NONE",
    authHeaderName: "Authorization",
  },
];

export function pinHostPresetById(id: string | null | undefined) {
  return PIN_HOST_PRESETS.find((preset) => preset.id === id) ?? null;
}
