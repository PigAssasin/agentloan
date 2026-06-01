"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArcBankLogo } from "../components/shared/ArcBankLogo";
import { useIsMobile } from "../hooks/use-is-mobile";

const HeroCanvas = dynamic(
  () => import("../components/shared/HeroCanvas").then(m => m.HeroCanvas),
  { ssr: false }
);

export default function LandingPage() {
  const isMobile = useIsMobile();

  return (
    <div style={{ fontFamily: "var(--font-body)", background: "#ffffff", color: "#000000" }}>

      {/* ── Navbar — logo only ───────────────────────────────── */}
      <header style={{ borderBottom: "3px solid #000000", position: "sticky", top: 0, zIndex: 100, background: "#ffffff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ArcBankLogo size={30} color="#000000" style={{ marginBottom: 6 }} />
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, letterSpacing: "-0.02em" }}>ArcBank</span>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{ borderBottom: "5px solid #000000" }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1.1fr",
          minHeight: isMobile ? "auto" : 420,
        }}>

          {/* Left — text */}
          <div style={{
            padding: isMobile ? "36px 24px" : "56px 40px 56px 24px",
            borderRight: isMobile ? "none" : "5px solid #000000",
            borderBottom: isMobile ? "5px solid #000000" : "none",
            display: "flex", flexDirection: "column", justifyContent: "center",
          }}>
            <div style={{ display: "inline-block", border: "2px solid #000000", padding: "4px 14px", marginBottom: 32, alignSelf: "flex-start" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Built on Arc Testnet
              </span>
            </div>

            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? "clamp(48px,12vw,72px)" : "clamp(52px,6vw,96px)", lineHeight: 0.92, marginBottom: 32 }}>
              LEND<br />BORROW<br />EARN
            </h1>

            <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.75, color: "#444444", marginBottom: 44, maxWidth: 400 }}>
              A decentralized lending protocol on Arc Network. Supply xclrBTC, xEURC, or xUSDC as collateral and borrow xUSDC at variable rates. Powered by Chainlink oracles.
            </p>

            <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
              <Link href="/app" style={{
                fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14,
                textTransform: "uppercase", letterSpacing: "0.1em",
                background: "#000000", color: "#ffffff",
                padding: "15px 36px", border: "4px solid #000000",
                textDecoration: "none", display: "inline-block",
              }}>
                Launch App
              </Link>
              <Link href="/docs" style={{
                fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14,
                textTransform: "uppercase", letterSpacing: "0.1em",
                background: "#ffffff", color: "#000000",
                padding: "15px 36px", border: "4px solid #000000",
                borderLeft: "none", textDecoration: "none", display: "inline-block",
              }}>
                Read Docs
              </Link>
            </div>
          </div>

          {/* Right — Bloomberg-style animated canvas — hidden on mobile (canvas below text) */}
          {!isMobile && (
            <div style={{ position: "relative", background: "#000000", display: "flex", alignItems: "stretch" }}>
              <HeroCanvas />
            </div>
          )}

        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <section style={{ borderBottom: "5px solid #000000" }}>
        <div
          className="col-2-mobile"
          style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}
        >
          {[
            { label: "Supported Assets", value: "3",        sub: "xclrBTC, xEURC, xUSDC" },
            { label: "Finality",         value: "<1s",      sub: "Deterministic" },
            { label: "Gas Cost",         value: "$0.01",    sub: "USDC per tx" },
            { label: "Network",          value: "Arc",      sub: "Testnet" },
          ].map(({ label, value, sub }, i) => (
            <div key={label} style={{
              padding: isMobile ? "20px 16px" : "28px 24px",
              borderRight: !isMobile && i < 3 ? "4px solid #000000" : "none",
              borderBottom: isMobile && i < 2 ? "4px solid #000000" : "none",
              borderLeft: isMobile && (i === 1 || i === 3) ? "4px solid #000000" : "none",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: isMobile ? 24 : 32, fontWeight: 700, lineHeight: 1, marginBottom: 6 }}>{value}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#bbbbbb", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </section>


      {/* ── Features ─────────────────────────────────────────── */}
      <section style={{ borderBottom: "5px solid #000000", padding: isMobile ? "40px 16px" : "72px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? 28 : 40, marginBottom: 48 }}>
            HOW IT WORKS
          </h2>
          <div
            className="col-1-mobile"
            style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, border: "4px solid #000000" }}
          >
            {[
              {
                step: "01",
                title: "Supply Collateral",
                desc: "Deposit cirBTC, EURC, or USDC into the lending pool. Your assets earn supply APY while being used as collateral. Withdraw anytime above your liquidation threshold.",
              },
              {
                step: "02",
                title: "Borrow USDC",
                desc: "Use your supplied collateral to borrow USDC at variable interest rates. Borrow up to 70–80% LTV depending on your collateral asset. Rates adjust dynamically based on pool utilization.",
              },
              {
                step: "03",
                title: "Manage Risk",
                desc: "Monitor your Health Factor in real time. Stay above 1.0 to avoid liquidation. Repay debt or add collateral to keep your position safe. Open liquidations reward liquidators with a bonus.",
              },
            ].map(({ step, title, desc }, i) => (
              <div key={step} style={{
                padding: isMobile ? "28px 20px" : "40px 32px",
                borderRight: !isMobile && i < 2 ? "4px solid #000000" : "none",
                borderBottom: isMobile && i < 2 ? "4px solid #000000" : "none",
              }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 48, fontWeight: 700, color: "#eeeeee", marginBottom: 16, lineHeight: 1 }}>{step}</div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 16 }}>{title.toUpperCase()}</h3>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.7, color: "#444444" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported Assets ─────────────────────────────────── */}
      <section style={{ borderBottom: "5px solid #000000", padding: isMobile ? "40px 16px" : "72px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? 28 : 40, marginBottom: 48 }}>
            SUPPORTED ASSETS
          </h2>
          <div className="scroll-x-mobile" style={{ border: "4px solid #000000" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "12px 24px", background: "#000000", minWidth: isMobile ? 540 : "auto" }}>
              {["Asset", "Type", "Max LTV", "Liq. Threshold", "Can Borrow"].map(h => (
                <span key={h} style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ffffff" }}>{h}</span>
              ))}
            </div>
            {[
              { name: "Arc Testnet BTC",  symbol: "xclrBTC", type: "Collateral", ltv: "70%", threshold: "75%", borrow: "No",  color: "#f7931a" },
              { name: "Arc Testnet Euro", symbol: "xEURC",   type: "Collateral", ltv: "80%", threshold: "85%", borrow: "No",  color: "#2775ca" },
              { name: "Arc Testnet USD",  symbol: "xUSDC",   type: "Borrow + Collateral", ltv: "80%", threshold: "85%", borrow: "Yes", color: "#2775ca" },
            ].map((asset, i) => (
              <div key={asset.symbol} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                gap: 8, padding: "20px 24px", alignItems: "center",
                borderTop: "3px solid #000000",
                background: i % 2 === 1 ? "#fafafa" : "#ffffff",
                minWidth: isMobile ? 540 : "auto",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: asset.color, border: "2px solid #000000", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    {asset.symbol === "xclrBTC" ? "₿" : asset.symbol === "xEURC" ? "€" : "$"}
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15 }}>{asset.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999" }}>{asset.symbol}</div>
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 14 }}>{asset.type}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>{asset.ltv}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>{asset.threshold}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: asset.borrow === "Yes" ? "#008000" : "#999999" }}>
                  {asset.borrow}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Technical stack ──────────────────────────────────── */}
      <section style={{ borderBottom: "5px solid #000000", padding: isMobile ? "40px 16px" : "72px 24px", background: "#000000", color: "#ffffff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? 28 : 40, marginBottom: 48, color: "#ffffff" }}>
            BUILT WITH
          </h2>
          <div
            className="col-1-mobile"
            style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, border: "4px solid #ffffff" }}
          >
            {[
              { name: "Arc Network",   desc: "L1 blockchain · Chain ID 5042002 · Sub-second finality · USDC gas token",    tag: "BLOCKCHAIN" },
              { name: "Chainlink",     desc: "Price feeds for cirBTC/USD and EURC/USD · Staleness guard max 3600s",         tag: "ORACLE" },
              { name: "Solidity 0.8", desc: "Smart contracts · OpenZeppelin · ReentrancyGuard · Pausable · Custom errors", tag: "CONTRACTS" },
              { name: "Next.js + wagmi", desc: "App Router · TypeScript · wagmi v2 · viem · RainbowKit · TanStack Query",  tag: "FRONTEND" },
            ].map(({ name, desc, tag }, i) => (
              <div key={name} style={{
                padding: isMobile ? "24px 20px" : "32px 24px",
                borderRight: !isMobile && i < 3 ? "4px solid #ffffff" : "none",
                borderBottom: isMobile && i < 3 ? "4px solid #ffffff" : "none",
              }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 12 }}>{tag}</div>
                <h4 style={{ fontFamily: "var(--font-heading)", fontSize: 20, color: "#ffffff", marginBottom: 12 }}>{name.toUpperCase()}</h4>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6, color: "#aaaaaa" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section style={{ borderBottom: "5px solid #000000", padding: isMobile ? "48px 16px" : "80px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? 32 : 48, marginBottom: 24 }}>
            START LENDING TODAY
          </h2>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "#444444", lineHeight: 1.7, marginBottom: 40 }}>
            Connect your wallet, mint free testnet tokens from the ArcBank faucet, and start supplying collateral on Arc Testnet in minutes.
          </p>
          <div style={{ display: "flex", gap: 0, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/app" style={{
              fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 16,
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: "#000000", color: "#ffffff",
              padding: "18px 48px", border: "4px solid #000000",
              textDecoration: "none",
            }}>
              Launch App →
            </Link>
            <Link href="/faucet" style={{
              fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 16,
              textTransform: "uppercase", letterSpacing: "0.08em",
              background: "#ffffff", color: "#000000",
              padding: "18px 48px", border: "4px solid #000000",
              borderLeft: "none", textDecoration: "none",
            }}>
              Get Test Tokens
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ padding: isMobile ? "32px 16px" : "40px 24px", borderTop: "5px solid #000000" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            className="col-1-mobile"
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: isMobile ? 24 : 48, marginBottom: 40 }}
          >

            {/* Brand */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <ArcBankLogo size={28} color="#000000" style={{ marginBottom: 6 }} />
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 20, letterSpacing: "-0.02em" }}>ArcBank</span>
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#666666", lineHeight: 1.7, maxWidth: 280 }}>
                Decentralized lending protocol built on Arc Network. Testnet only. Use responsibly.
              </p>
            </div>

            {/* Protocol */}
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999999", marginBottom: 16 }}>Protocol</div>
              {[
                { label: "Dashboard", href: "/app" },
                { label: "Markets",   href: "/markets" },
                { label: "Profile",   href: "/profile" },
                { label: "Faucet",    href: "/faucet" },
              ].map(({ label, href }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <Link href={href} style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#000000", textDecoration: "none", fontWeight: 400 }}>
                    {label}
                  </Link>
                </div>
              ))}
            </div>

            {/* Arc Network */}
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999999", marginBottom: 16 }}>Arc Network</div>
              {[
                { label: "Arc Official",   href: "https://arc.io" },
                { label: "ArcScan",        href: "https://testnet.arcscan.app" },
                { label: "Faucet",         href: "https://faucet.circle.com" },
                { label: "Documentation",  href: "https://docs.arc.io" },
              ].map(({ label, href }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#000000", textDecoration: "none" }}>
                    {label} ↗
                  </a>
                </div>
              ))}
            </div>

            {/* Developer */}
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999999", marginBottom: 16 }}>Developer</div>
              {[
                { label: "Twitter / X",  href: "https://x.com/nheoweb3" },
                { label: "LinkedIn",     href: "https://www.linkedin.com/in/ha-nguyen-28645426a/" },
                { label: "GitHub",       href: "https://github.com/PigAssasin/arcbank" },
              ].map(({ label, href }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#000000", textDecoration: "none" }}>
                    {label} ↗
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{
            borderTop: "3px solid #000000", paddingTop: 24,
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            gap: isMobile ? 8 : 0,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999" }}>
              ArcBank · Arc Testnet (Chain ID: 5042002) · Not audited · Testnet only
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999" }}>
              © 2026
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
