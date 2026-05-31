"use client";

import { useState } from "react";
import { RainbowKitProvider, getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { arcTestnet } from "../../config/networks";
import "@rainbow-me/rainbowkit/styles.css";

// Prevent MetaMask SDK from crashing during SSR — it accesses localStorage at module level
if (typeof window === "undefined") {
  const noop = () => null;
  (global as unknown as Record<string, unknown>).localStorage = {
    getItem: noop, setItem: noop, removeItem: noop, clear: noop, key: noop, length: 0,
  };
}

// I-1: WalletConnect requires a real project ID from cloud.walletconnect.com
// Without it, WalletConnect connections are disabled (MetaMask injected wallet still works)
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || undefined;

const wagmiConfig = getDefaultConfig({
  appName: "sinX",
  projectId: wcProjectId ?? "00000000000000000000000000000000", // WC disabled if not set
  chains: [arcTestnet],
  ssr: true,
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  // QueryClient inside component — each render tree gets its own instance, preventing SSR data leaks
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: "#000000",
            accentColorForeground: "#ffffff",
            borderRadius: "none",
            fontStack: "system",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
