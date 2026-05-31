"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArcBankLogo } from "./ArcBankLogo";

const btnBase: React.CSSProperties = {
  height: 40, padding: "0 20px", border: "3px solid #000000",
  fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 12,
  textTransform: "uppercase", letterSpacing: "0.08em",
  cursor: "pointer", whiteSpace: "nowrap",
};
const btnBlack: React.CSSProperties = { ...btnBase, background: "#000000", color: "#ffffff" };
const btnWhite: React.CSSProperties = { ...btnBase, background: "#ffffff", color: "#000000" };

const LINKS = [
  { href: "/app",     label: "Dashboard" },
  { href: "/markets", label: "Markets"   },
  { href: "/profile", label: "Profile"   },
  { href: "/faucet",  label: "Faucet"    },
];

export function Navbar() {
  const path = usePathname();
  return (
    <header style={{
      background:   "#ffffff",
      borderBottom: "5px solid #000000",
      position:     "sticky",
      top:          0,
      zIndex:       100,
    }}>
      <div style={{
        maxWidth:   "var(--page-max-width)",
        margin:     "0 auto",
        padding:    "0 24px",
        height:     68,
        display:    "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        {/* Logo */}
        <Link href="/app" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <ArcBankLogo size={34} color="#000000" style={{ marginBottom: 3 }} />
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: "#000000", letterSpacing: "-0.02em" }}>
            ArcBank
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: "flex", gap: 0 }}>
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href} style={{
              fontFamily:     "var(--font-body)",
              fontWeight:     600,
              fontSize:       13,
              textTransform:  "uppercase",
              letterSpacing:  "0.08em",
              color:          path?.startsWith(href) ? "#ffffff" : "#000000",
              textDecoration: "none",
              padding:        "8px 20px",
              borderLeft:     "2px solid #000000",
              background:     path?.startsWith(href) ? "#000000" : "transparent",
            } as React.CSSProperties}>
              {label}
            </Link>
          ))}
        </nav>

        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal }) => {
            if (!account) return (
              <button onClick={openConnectModal} style={btnBlack}>
                CONNECT WALLET
              </button>
            );
            if (chain?.unsupported) return (
              <button onClick={openChainModal} style={{ ...btnWhite, borderColor: "#FF0000", color: "#FF0000" }}>
                WRONG NETWORK
              </button>
            );
            return (
              <button onClick={openAccountModal} style={btnBlack}>
                {account.displayName}
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}
