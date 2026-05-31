"use client";

import { useEffect, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from "wagmi";
import { parseUnits } from "viem";
import { TokenIcon }  from "@/components/shared/TokenIcon";
import MockERC20ABI   from "@/lib/abi-mock-erc20.json";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";

const TOKENS = [
  {
    symbol:    "xUSDC",
    name:      "Arc Testnet USD",
    address:   ARC_TESTNET_CONTRACTS.X_USDC,
    decimals:  6,
    mintAmount: parseUnits("10000", 6),
    display:   "10,000",
    desc:      "Testnet stablecoin — borrow asset & collateral",
  },
  {
    symbol:    "xEURC",
    name:      "Arc Testnet Euro",
    address:   ARC_TESTNET_CONTRACTS.X_EURC,
    decimals:  6,
    mintAmount: parseUnits("10000", 6),
    display:   "10,000",
    desc:      "Testnet euro stablecoin — collateral asset",
  },
  {
    symbol:    "xclrBTC",
    name:      "Arc Testnet BTC",
    address:   ARC_TESTNET_CONTRACTS.X_CLR_BTC,
    decimals:  8,
    mintAmount: parseUnits("1", 8),
    display:   "1",
    desc:      "Testnet bitcoin — primary collateral asset",
  },
];

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function MintButton({ token }: { token: typeof TOKENS[0] }) {
  const { address } = useAccount();

  // Read on-chain cooldown — bypasses localStorage entirely
  const { data: remainingRaw, refetch: refetchCooldown } = useReadContract({
    address:      token.address,
    abi:          MockERC20ABI as any,
    functionName: "cooldownRemaining",
    args:         address ? [address] : undefined,
    query:        { enabled: !!address, refetchInterval: 5_000 },
  });

  const remainingSec = Number((remainingRaw as bigint) ?? 0n);
  const onCooldown   = remainingSec > 0;

  // Live countdown timer
  const [countdown, setCountdown] = useState(remainingSec);
  useEffect(() => { setCountdown(remainingSec); }, [remainingSec]);
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const { writeContract, data: txHash, isPending: sending } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash } as any,
  });

  // After mint confirmed → refresh cooldown from chain
  useEffect(() => {
    if (isSuccess) { refetchCooldown(); }
  }, [isSuccess]);

  const isPending = sending || confirming;

  function handleMint() {
    if (!address || onCooldown) return;
    writeContract({
      address:      token.address,
      abi:          MockERC20ABI as any,
      functionName: "mint",
      args:         [address, token.mintAmount],
    });
  }

  if (isSuccess && countdown > 0) return (
    <div style={{ textAlign: "center" }}>
      <div style={{ border: "3px solid #008000", padding: "10px 0", color: "#008000", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, textAlign: "center" }}>
        ✓ MINTED
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#999999", textAlign: "center" }}>
        Next in {fmtTime(countdown)}
      </div>
    </div>
  );

  if (onCooldown) return (
    <div style={{ textAlign: "center" }}>
      <div style={{ border: "3px solid #999999", padding: "10px 0", color: "#999999", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", marginBottom: 4 }}>
        COOLDOWN
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#999999", textAlign: "center" }}>
        {fmtTime(countdown)} remaining
      </div>
    </div>
  );

  return (
    <button onClick={handleMint} disabled={isPending || !address}
      style={{
        width: "100%", padding: "14px 0",
        border: `3px solid ${isPending || !address ? "#999999" : "#000000"}`,
        background: isPending || !address ? "#eeeeee" : "#000000",
        color: isPending || !address ? "#999999" : "#ffffff",
        fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.08em",
        cursor: isPending || !address ? "not-allowed" : "pointer",
      }}>
      {!address ? "CONNECT WALLET" : isPending ? "MINTING..." : `MINT ${token.symbol}`}
    </button>
  );
}

export default function FaucetPage() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div style={{ width: 10, height: 48, background: "#000000", flexShrink: 0 }} />
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 36, color: "#000000", margin: 0 }}>
            TEST FAUCET
          </h1>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#666666", margin: 0, paddingLeft: 26 }}>
          Mint testnet tokens to your wallet. No real value — Arc Testnet only.
        </p>
      </div>

      {/* Notice banner */}
      <div style={{ border: "3px solid #000000", background: "#f5f5f5", padding: "14px 20px", marginBottom: 32, display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "#000000", color: "#ffffff", padding: "2px 8px", flexShrink: 0, marginTop: 1 }}>
          ON-CHAIN
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#333333", margin: 0, lineHeight: 1.5 }}>
          Cooldown enforced on-chain — cannot be bypassed by clearing browser data. 24h per token per wallet. Connect to Arc Testnet (Chain ID: 5042002).
        </p>
      </div>

      {/* Token cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {TOKENS.map((token, i) => (
          <div key={token.symbol} style={{ border: "3px solid #000000", borderTop: i === 0 ? "3px solid #000000" : "0px", padding: "24px 28px", display: "flex", alignItems: "center", gap: 20, background: "#ffffff" }}>
            <TokenIcon symbol={token.symbol} size={44} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "#000000" }}>{token.symbol}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{token.name}</span>
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#666666", marginBottom: 6 }}>{token.desc}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "2px solid #000000", padding: "2px 10px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>{token.display}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#666666" }}>{token.symbol} per mint · 24h cooldown</span>
              </div>
            </div>
            <div style={{ flexShrink: 0, width: 140 }}>
              <MintButton token={token} />
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 32, padding: "16px 20px", border: "2px solid #dddddd", borderLeft: "5px solid #000000" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#666666", margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: "#000000" }}>Why testnet tokens?</strong> The Arc Testnet faucet gives 20 USDC + 20 EURC + 0.0001 cirBTC every 2 hours — not enough for meaningful lending tests. xUSDC, xEURC and xclrBTC are our own testnet tokens with on-chain 24h cooldown. The pool is pre-seeded with 500k xUSDC + 200k xEURC + 10 xclrBTC.
        </p>
      </div>
    </div>
  );
}
