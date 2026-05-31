"use client";

import { useState } from "react";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
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

const wagmiConfig = getDefaultConfig({
  appName: "sinX",
  // Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local before production deploy
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "arc-lending-dev",
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
          theme={darkTheme({
            accentColor: "rgba(255,255,255,0.1)",
            accentColorForeground: "#ffffff",
            borderRadius: "large",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
