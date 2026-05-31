"use client";

import { useState } from "react";
import { TokenIcon } from "@/components/shared/TokenIcon";

const TOKENS = [
  {
    symbol:  "xUSDC",
    name:    "Arc Testnet USD",
    amount:  "10,000",
    unit:    "xUSDC",
    desc:    "Testnet stablecoin — borrow asset & collateral",
    color:   "#2775ca",
  },
  {
    symbol:  "xEURC",
    name:    "Arc Testnet Euro",
    amount:  "10,000",
    unit:    "xEURC",
    desc:    "Testnet euro stablecoin — collateral asset",
    color:   "#5b6eae",
  },
  {
    symbol:  "xclrBTC",
    name:    "Arc Testnet BTC",
    amount:  "1",
    unit:    "xclrBTC",
    desc:    "Testnet bitcoin — primary collateral asset",
    color:   "#f7931a",
  },
];

type MintState = "idle" | "pending" | "done";

export default function FaucetPage() {
  const [states, setStates] = useState<Record<string, MintState>>({
    USDC: "idle", EURC: "idle", cirBTC: "idle",
  });

  async function handleMint(symbol: string) {
    setStates(s => ({ ...s, [symbol]: "pending" }));
    await new Promise(r => setTimeout(r, 1500));
    setStates(s => ({ ...s, [symbol]: "done" }));
  }

  function handleReset(symbol: string) {
    setStates(s => ({ ...s, [symbol]: "idle" }));
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div style={{ width: 10, height: 48, background: "#000000", flexShrink: 0 }} />
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: 36,
            color: "#000000",
            margin: 0,
          }}>
            TEST FAUCET
          </h1>
        </div>
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "#666666",
          margin: 0,
          paddingLeft: 26,
        }}>
          Mint testnet tokens to your wallet. These are mock tokens for Arc Testnet only — no real value.
        </p>
      </div>

      {/* Notice banner */}
      <div style={{
        border: "3px solid #000000",
        background: "#f5f5f5",
        padding: "14px 20px",
        marginBottom: 32,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          background: "#000000",
          color: "#ffffff",
          padding: "2px 8px",
          flexShrink: 0,
          marginTop: 1,
        }}>
          TESTNET
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#333333", margin: 0, lineHeight: 1.5 }}>
          Contracts not deployed yet — faucet will be active after launch. Connect your wallet to Arc Testnet (Chain ID: 5042002) before minting.
        </p>
      </div>

      {/* Token cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {TOKENS.map((token, i) => {
          const state = states[token.symbol];
          return (
            <div
              key={token.symbol}
              style={{
                border: "3px solid #000000",
                borderTop: i === 0 ? "3px solid #000000" : "0px",
                padding: "24px 28px",
                display: "flex",
                alignItems: "center",
                gap: 20,
                background: "#ffffff",
              }}
            >
              {/* Token icon + info */}
              <TokenIcon symbol={token.symbol} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, color: "#000000" }}>
                    {token.symbol}
                  </span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>
                    {token.name}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#666666", marginBottom: 6 }}>
                  {token.desc}
                </div>
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "2px solid #000000",
                  padding: "2px 10px",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>
                    {token.amount}
                  </span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#666666" }}>
                    {token.unit} per mint
                  </span>
                </div>
              </div>

              {/* Mint button */}
              <div style={{ flexShrink: 0, width: 140 }}>
                {state === "done" ? (
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      border: "3px solid #008000",
                      padding: "10px 0",
                      background: "#ffffff",
                      color: "#008000",
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 8,
                      textAlign: "center",
                    }}>
                      ✓ MINTED
                    </div>
                    <button
                      onClick={() => handleReset(token.symbol)}
                      style={{
                        width: "100%",
                        padding: "6px 0",
                        border: "2px solid #999999",
                        background: "transparent",
                        color: "#999999",
                        fontFamily: "var(--font-body)",
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        cursor: "pointer",
                      }}
                    >
                      MINT AGAIN
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleMint(token.symbol)}
                    disabled={state === "pending"}
                    style={{
                      width: "100%",
                      padding: "14px 0",
                      border: `3px solid ${state === "pending" ? "#999999" : "#000000"}`,
                      background: state === "pending" ? "#eeeeee" : "#000000",
                      color: state === "pending" ? "#999999" : "#ffffff",
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      cursor: state === "pending" ? "not-allowed" : "pointer",
                    }}
                  >
                    {state === "pending" ? "MINTING..." : `MINT ${token.symbol}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 32,
        padding: "16px 20px",
        border: "2px solid #dddddd",
        borderLeft: "5px solid #000000",
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#666666", margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: "#000000" }}>Why testnet tokens?</strong> The Arc Testnet faucet gives 20 USDC + 20 EURC + 0.0001 cirBTC every 2 hours — not enough for meaningful lending tests. xUSDC, xEURC and xclrBTC are our own testnet tokens: mint freely, test everything. The pool is pre-seeded with large initial liquidity so borrowing works from day one.
        </p>
      </div>
    </div>
  );
}
