"use client";

import { TokenIcon }    from "../../components/shared/TokenIcon";
import { useReserveData, TOKENS } from "../../hooks/use-lending-pool";

const ARC_NATIVE_TOKENS = [
  {
    symbol:    "USDC",
    name:      "USD Coin",
    address:   "0x3600000000000000000000000000000000000000",
    supplyAPY: "—",
    borrowAPY: "—",
    capacity:  "$1,000",
    note:      "Arc native",
  },
  {
    symbol:    "EURC",
    name:      "Euro Coin",
    address:   "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    supplyAPY: "—",
    borrowAPY: "—",
    capacity:  "$1,000",
    note:      "Arc native",
  },
  {
    symbol:    "cirBTC",
    name:      "Circle BTC",
    address:   "TBA",
    supplyAPY: "—",
    borrowAPY: "—",
    capacity:  "0.01 BTC",
    note:      "Arc native",
  },
];

const colH: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999",
};

export default function MarketsPage() {
  const { reserves, isLoading } = useReserveData();
  const tokenList = Object.values(TOKENS);

  const totalSupplied = tokenList.reduce((a, t) => a + (reserves[t.symbol]?.totalSupplied ?? 0), 0);
  const totalBorrowed = tokenList.reduce((a, t) => a + (reserves[t.symbol]?.totalBorrowed ?? 0), 0);

  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: "32px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32, borderBottom: "4px solid #000000", paddingBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 48, marginBottom: 0 }}>
          MARKETS
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, marginBottom: 40, border: "4px solid #000000" }}>
        {[
          { label: "Total Market Size", value: isLoading ? "..." : `$${totalSupplied.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
          { label: "Total Borrowed",    value: isLoading ? "..." : `$${totalBorrowed.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
          { label: "Active Markets",    value: String(tokenList.length) },
        ].map(({ label, value }, i) => (
          <div key={label} style={{ padding: "20px 24px", borderRight: i < 2 ? "4px solid #000000" : "none" }}>
            <div style={{ ...colH, marginBottom: 8 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Section 1: Testnet Pool ── */}
      <div style={{ marginBottom: 40 }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 0, background: "#000000", padding: "14px 24px", border: "4px solid #000000" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, color: "#ffffff", margin: 0 }}>
            TESTNET POOL
          </h2>
          <div style={{ padding: "2px 10px", border: "2px solid #ffffff", fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#ffffff" }}>
            MOCK TOKENS
          </div>
        </div>

        {/* Table */}
        <div style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {["Asset", "Total Supplied", "Supply APY", "Total Borrowed", "Borrow APY", "Utilization"].map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>

          {tokenList.map((t, i) => {
            const r    = reserves[t.symbol];
            const sup  = r?.totalSupplied  ?? 0;
            const bor  = r?.totalBorrowed  ?? 0;
            const util = r?.utilization    ?? 0;
            const sApy = r?.supplyApy      ?? 0;
            const bApy = r?.borrowApy      ?? 0;

            return (
              <div key={t.symbol} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
                gap: 8, padding: "16px 24px", alignItems: "center",
                borderBottom: i < tokenList.length - 1 ? "2px solid #000000" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TokenIcon symbol={t.symbol} size={28} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14 }}>{t.symbol}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                    {isLoading ? "..." : sup >= 1e6 ? `$${(sup / 1e6).toFixed(2)}M` : `$${sup.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#008000" }}>
                  {isLoading ? "..." : `${sApy.toFixed(2)}%`}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                  {isLoading ? "..." : bor > 0 ? (bor >= 1e6 ? `$${(bor / 1e6).toFixed(2)}M` : `$${bor.toLocaleString(undefined, { maximumFractionDigits: 2 })}`) : "$0.00"}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: bApy > 0 ? "#FFA500" : "#999999" }}>
                  {isLoading ? "..." : bApy > 0 ? `${bApy.toFixed(2)}%` : "N/A"}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>
                    {isLoading ? "..." : `${util.toFixed(1)}%`}
                  </div>
                  <div style={{ marginTop: 4, height: 4, background: "#eeeeee", border: "1px solid #cccccc" }}>
                    <div style={{ height: "100%", width: `${Math.min(util, 100)}%`, background: util > 80 ? "#FF0000" : util > 60 ? "#FFA500" : "#008000" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Arc Native Tokens ── */}
      <div style={{ marginBottom: 40 }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 0, background: "#000000", padding: "14px 24px", border: "4px solid #000000" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, color: "#ffffff", margin: 0 }}>
            ARC NATIVE TOKENS
          </h2>
          <div style={{ padding: "2px 10px", border: "2px solid #FFA500", fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#FFA500" }}>
            LIMITED
          </div>
        </div>

        {/* Not seeded notice */}
        <div style={{ border: "4px solid #000000", borderTop: "none", borderBottom: "none", background: "#f5f5f5", padding: "14px 24px", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "#FFA500", color: "#000000", padding: "2px 8px", flexShrink: 0, marginTop: 1 }}>
            INFO
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#333333", margin: 0, lineHeight: 1.5 }}>
            POOL NOT YET SEEDED — Supply these from Arc Testnet faucet: supply cap 1,000 USDC / 1,000 EURC / 0.01 cirBTC. Live APY data will appear once the pool is seeded.
          </p>
        </div>

        {/* Table */}
        <div style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff", position: "relative" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {["Asset", "Total Supplied", "Supply APY", "Total Borrowed", "Borrow APY", "Utilization"].map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>

          {/* Overlay */}
          <div style={{ position: "absolute", top: 41, left: 0, right: 0, bottom: 0, background: "rgba(255,255,255,0.75)", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
            <div style={{ border: "3px solid #000000", padding: "12px 28px", background: "#ffffff", fontFamily: "var(--font-heading)", fontSize: 18, letterSpacing: "0.05em" }}>
              COMING SOON
            </div>
          </div>

          {ARC_NATIVE_TOKENS.map((t, i) => (
            <div key={t.symbol} style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
              gap: 8, padding: "16px 24px", alignItems: "center",
              borderBottom: i < ARC_NATIVE_TOKENS.length - 1 ? "2px solid #000000" : "none",
              opacity: 0.4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <TokenIcon symbol={t.symbol} size={28} />
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14 }}>{t.symbol}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>{t.capacity}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>{t.supplyAPY}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>—</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>{t.borrowAPY}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>—</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
