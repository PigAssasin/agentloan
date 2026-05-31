"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SineLogo } from "./SineLogo";

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
          <SineLogo size={34} color="#000000" />
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: "#000000", letterSpacing: "-0.02em" }}>
            sinX
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

        <ConnectButton chainStatus="none" showBalance={false} accountStatus="address" />
      </div>
    </header>
  );
}
