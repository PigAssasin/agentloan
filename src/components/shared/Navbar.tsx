"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AgentLoanLogo } from "./ArcBankLogo";
import { useIsMobile } from "../../hooks/use-is-mobile";

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
  { href: "/docs",    label: "Docs"      },
];

export function Navbar() {
  const path = usePathname();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

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
        {/* Logo — links to landing page */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <AgentLoanLogo size={34} color="#000000" style={{ marginBottom: 6 }} />
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: "#000000", letterSpacing: "-0.02em" }}>
            AgentLoan
          </span>
        </Link>

        {/* Desktop nav links */}
        {!isMobile && (
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
        )}

        {/* Right side: connect + optional hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal }) => {
              if (!account) return (
                <button onClick={openConnectModal} style={btnBlack}>
                  {isMobile ? "CONNECT" : "CONNECT WALLET"}
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

          {/* Hamburger button — mobile only */}
          {isMobile && (
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{
                background: menuOpen ? "#000000" : "#ffffff",
                border: "3px solid #000000",
                width: 40, height: 40,
                cursor: "pointer",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 5,
                flexShrink: 0,
              }}
              aria-label="Toggle menu"
            >
              {/* Three bars — animate to X when open */}
              {menuOpen ? (
                <span style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 700, color: "#ffffff", lineHeight: 1 }}>✕</span>
              ) : (
                <>
                  <span style={{ display: "block", width: 18, height: 2, background: "#000000" }} />
                  <span style={{ display: "block", width: 18, height: 2, background: "#000000" }} />
                  <span style={{ display: "block", width: 18, height: 2, background: "#000000" }} />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {isMobile && menuOpen && (
        <nav style={{
          borderTop: "3px solid #000000",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
        }}>
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily:     "var(--font-body)",
                fontWeight:     600,
                fontSize:       14,
                textTransform:  "uppercase",
                letterSpacing:  "0.08em",
                color:          path?.startsWith(href) ? "#ffffff" : "#000000",
                textDecoration: "none",
                padding:        "16px 24px",
                borderBottom:   "2px solid #000000",
                background:     path?.startsWith(href) ? "#000000" : "transparent",
                display:        "block",
              } as React.CSSProperties}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
