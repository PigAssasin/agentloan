"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { arcTestnet } from "../../../config/networks";

export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  // Show children only when connected AND on the right chain.
  // If not connected: show children (pages handle the unconnected state themselves).
  // If connected on wrong chain: show the switch prompt below.
  if (!isConnected) return <>{children}</>;
  if (chainId === arcTestnet.id) return <>{children}</>;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#ffffff",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 32,
      border: "8px solid #000000",
    }}>
      <div style={{ width: 64, height: 64, background: "#000000" }} />
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 32, marginBottom: 12 }}>
          WRONG NETWORK
        </h2>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "#999999", maxWidth: 320 }}>
          Arc Lending runs exclusively on Arc Testnet. Please switch to continue.
        </p>
      </div>
      <button className="btn btn-primary" style={{ width: "auto", padding: "14px 40px" }}
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={isPending}>
        {isPending ? "SWITCHING..." : "SWITCH TO ARC TESTNET"}
      </button>
    </div>
  );
}
