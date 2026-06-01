"use client";

import Link from "next/link";

const SECTIONS = [
  {
    title: "Getting Started",
    slug: "getting-started",
    desc: "Connect your wallet, get testnet tokens, and make your first supply.",
  },
  {
    title: "How to Supply",
    slug: "supply",
    desc: "Deposit assets to earn variable APY as collateral.",
  },
  {
    title: "How to Borrow",
    slug: "borrow",
    desc: "Borrow xUSDC against your supplied collateral.",
  },
  {
    title: "How to Repay",
    slug: "repay",
    desc: "Repay your debt to restore health factor.",
  },
  {
    title: "Health Factor",
    slug: "health-factor",
    desc: "Understand liquidation risk and how to stay safe.",
  },
  {
    title: "APY & Interest",
    slug: "apy",
    desc: "How variable rates and scaled balances work.",
  },
  {
    title: "Liquidations",
    slug: "liquidations",
    desc: "How undercollateralized positions are liquidated.",
  },
  {
    title: "DeFi Agents",
    slug: "agents",
    desc: "Liquidation Bot, Guardian Agent, and Yield Optimizer — autonomous protocol protection.",
  },
  {
    title: "Smart Contracts",
    slug: "contracts",
    desc: "Technical reference — addresses, ABIs, and architecture.",
  },
  {
    title: "FAQ",
    slug: "faq",
    desc: "Common questions about ArcBank and Arc Testnet.",
  },
];

export default function DocsPage() {
  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 48, borderBottom: "4px solid #000", paddingBottom: 32 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 16, border: "2px solid #000", padding: "4px 14px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Documentation</span>
        </div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 56, lineHeight: 0.95, marginBottom: 16 }}>
          ARCBANK<br />DOCS
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "#666", maxWidth: 560, lineHeight: 1.7 }}>
          Everything you need to use ArcBank — a decentralized lending protocol on Arc Testnet.
          Supply collateral, borrow stablecoins, and earn yield, all on-chain.
        </p>
      </div>

      {/* Quick links */}
      <div style={{ display: "flex", gap: 0, marginBottom: 48 }}>
        <Link href="/app" style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", background: "#000", color: "#fff", padding: "12px 28px", border: "3px solid #000", textDecoration: "none" }}>
          Launch App →
        </Link>
        <Link href="/faucet" style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", background: "#fff", color: "#000", padding: "12px 28px", border: "3px solid #000", borderLeft: "none", textDecoration: "none" }}>
          Get Test Tokens
        </Link>
      </div>

      {/* Sections grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: "4px solid #000" }}>
        {SECTIONS.map(({ title, slug, desc }, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const total = SECTIONS.length;
          const isLastRow = i >= total - (total % 3 || 3);
          return (
            <Link key={slug} href={`/docs/${slug}`} style={{
              display: "block",
              padding: "28px 24px",
              borderRight: col < 2 ? "3px solid #000" : "none",
              borderBottom: !isLastRow ? "3px solid #000" : "none",
              textDecoration: "none",
              background: "#fff",
              transition: "background 0.1s",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "#000")}
              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 10 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 8, color: "inherit" }}>{title.toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666", lineHeight: 1.6 }}>{desc}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
