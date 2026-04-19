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

const wcEnabledWallets = projectId
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

export const wagmiConfig = createConfig({
  chains: [mainnet, base],
  connectors,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
  },
  ssr: true,
});
