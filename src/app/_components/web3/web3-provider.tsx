"use client";

import "@rainbow-me/rainbowkit/styles.css";

import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "./wagmi-config";

const accentColor = "#2e6f4a";
const accentColorDark = "#7fbf97";

const sharedThemeOverrides = {
  borderRadius: "large" as const,
  fontStack: "system" as const,
  overlayBlur: "small" as const,
};

const lightAgorixTheme = lightTheme({
  ...sharedThemeOverrides,
  accentColor,
  accentColorForeground: "#fafaf7",
});

const darkAgorixTheme = darkTheme({
  ...sharedThemeOverrides,
  accentColor: accentColorDark,
  accentColorForeground: "#0e0e0b",
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? darkAgorixTheme : lightAgorixTheme;

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={theme}
          modalSize="compact"
          appInfo={{ appName: "Agorix" }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
