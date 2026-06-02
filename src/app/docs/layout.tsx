"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Overview", href: "/docs" },
  { label: "Getting Started", href: "/docs/getting-started" },
  { divider: "Using AgentLoan" },
  { label: "Supply", href: "/docs/supply" },
  { label: "Borrow", href: "/docs/borrow" },
  { label: "Repay", href: "/docs/repay" },
  { label: "Withdraw", href: "/docs/withdraw" },
  { divider: "Concepts" },
  { label: "Health Factor", href: "/docs/health-factor" },
  { label: "APY & Interest", href: "/docs/apy" },
  { label: "Liquidations", href: "/docs/liquidations" },
  { divider: "Agents" },
  { label: "DeFi Agents", href: "/docs/agents" },
  { divider: "Reference" },
  { label: "Smart Contracts", href: "/docs/contracts" },
  { label: "FAQ", href: "/docs/faq" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div style={{ display: "flex", maxWidth: "var(--page-max-width)", margin: "0 auto", minHeight: "calc(100vh - 68px)" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, borderRight: "3px solid #000", padding: "32px 0", position: "sticky", top: 68, height: "calc(100vh - 68px)", overflowY: "auto" }}>
        {NAV.map((item, i) => {
          if ("divider" in item) return (
            <div key={i} style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#999", padding: "20px 24px 8px" }}>
              {item.divider}
            </div>
          );
          const active = path === item.href;
          return (
            <Link key={item.href} href={item.href!} style={{
              display: "block", padding: "8px 24px",
              fontFamily: "var(--font-body)", fontSize: 13, fontWeight: active ? 600 : 400,
              textDecoration: "none",
              color: active ? "#fff" : "#000",
              background: active ? "#000" : "transparent",
              borderLeft: active ? "3px solid #000" : "3px solid transparent",
            }}>
              {item.label}
            </Link>
          );
        })}
      </aside>

      {/* Content */}
      <main style={{ flex: 1, padding: "48px 48px 80px", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
