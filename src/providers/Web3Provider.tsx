"use client";

import { useState } from "react";
import { RainbowKitProvider, getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { arcTestnet } from "../../config/networks";
import "@rainbow-me/rainbowkit/styles.css";

// Prevent MetaMask SDK from crashing during SSR
if (typeof window === "undefined") {
  const noop = () => null;
  (global as unknown as Record<string, unknown>).localStorage = {
    getItem: noop, setItem: noop, removeItem: noop, clear: noop, key: noop, length: 0,
  };
}

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// When no WalletConnect projectId is set, use injected-only config to avoid
// Reown/WalletConnect errors about localhost not being on the allowlist (I-1 fix)
const wagmiConfig = wcProjectId
  ? getDefaultConfig({
      appName: "AgentLoan",
      projectId: wcProjectId,
      chains: [arcTestnet],
      ssr: true,
    })
  : createConfig({
      chains: [arcTestnet],
      connectors: [injected()],
      transports: { [arcTestnet.id]: http() },
      ssr: true,
    });

export function Web3Provider({ children }: { children: React.ReactNode }) {
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
