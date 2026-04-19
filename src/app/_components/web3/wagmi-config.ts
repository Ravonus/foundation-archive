import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";

import { env } from "~/env";

const projectId = env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const isServer = typeof window === "undefined";

const wcEnabledWallets = !isServer && projectId
  ? [walletConnectWallet, rainbowWallet, coinbaseWallet]
  : [coinbaseWallet];

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [injectedWallet, metaMaskWallet, ...wcEnabledWallets],
    },
  ],
  {
    appName: "Agorix",
    projectId: projectId || "agorix-fallback-no-walletconnect",
  },
);

const mainnetRpcUrl =
  env.NEXT_PUBLIC_ETHEREUM_RPC_URL ?? "https://cloudflare-eth.com";
const baseRpcUrl = env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";

const transportOptions = {
  batch: { batchSize: 100, wait: 16 },
  retryCount: 0,
  timeout: 15_000,
} as const;

export const wagmiConfig = createConfig({
  chains: [mainnet, base],
  connectors,
  transports: {
    [mainnet.id]: http(mainnetRpcUrl, transportOptions),
    [base.id]: http(baseRpcUrl, transportOptions),
  },
  ssr: true,
});
