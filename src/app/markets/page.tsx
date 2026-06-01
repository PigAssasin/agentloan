"use client";

import { TokenIcon }    from "../../components/shared/TokenIcon";
import { useReserveData, TOKENS, fmtUSD, TokenSymbol } from "../../hooks/use-lending-pool";
import { useMarketPrices, MarketPrices } from "../../hooks/use-market-prices";
import { useIsMobile }  from "../../hooks/use-is-mobile";

// ── Continuously scrolling price ticker ───────────────────
function PriceTicker({
  livePrice, reserves, tokenList,
}: {
  livePrice: MarketPrices;
  reserves: Record<string, any>;
  tokenList: typeof TOKENS[TokenSymbol][];
}) {
  const items = [
    ...tokenList.map(t => {
      const r = reserves[t.symbol];
      const price = t.symbol === "xclrBTC"
        ? livePrice.BTC
        : t.symbol === "xEURC"
        ? livePrice.EUR
        : livePrice.USDC;
      const apy = r?.borrowApy ?? r?.supplyApy ?? 0;
      return {
        label: t.symbol,
        price: price ? (t.symbol === "xclrBTC"
          ? `$${price.toLocaleString("en-US")}`
          : `$${price.toFixed(4)}`) : "—",
        apy: apy > 0 ? `${apy.toFixed(2)}% APY` : null,
      };
    }),
    // Placeholder for future tokens
    { label: "EURC", price: livePrice.EUR ? `$${livePrice.EUR.toFixed(4)}` : "—", apy: null },
    { label: "USDC", price: "$1.0000", apy: null },
  ];

  // Duplicate items for seamless loop
  const allItems = [...items, ...items, ...items];

  return (
    <div style={{
      marginBottom: 32,
      border: "3px solid #000",
      background: "#000",
      overflow: "hidden",
      position: "relative",
      height: 40,
    }}>
      {/* LIVE badge */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 2,
        background: "#000", borderRight: "2px solid #333",
        display: "flex", alignItems: "center", gap: 6, padding: "0 14px",
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: livePrice.BTC ? "#00ff88" : "#555",
          animation: livePrice.BTC ? "pulse 2s infinite" : "none",
        }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#555", letterSpacing: "0.1em" }}>
          LIVE
        </span>
      </div>

      {/* Scrolling track */}
      <div style={{
        display: "flex",
        alignItems: "center",
        height: "100%",
        paddingLeft: 68,
        animation: "ticker-scroll 40s linear infinite",
        whiteSpace: "nowrap",
        width: "max-content",
      }}>
        {allItems.map((item, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 10, marginRight: 48 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#555" }}>
              {item.label}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#00ff88" }}>
              {item.price}
            </span>
            {item.apy && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#FFA500" }}>
                {item.apy}
              </span>
            )}
            <span style={{ color: "#333", fontSize: 10 }}>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

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
  const livePrice = useMarketPrices(30_000); // refresh every 30s
  const isMobile  = useIsMobile();

  const totalSupplied = tokenList.reduce((a, t) => a + (reserves[t.symbol]?.totalSuppliedUSD ?? 0), 0);
  const totalBorrowed = tokenList.reduce((a, t) => a + (reserves[t.symbol]?.totalBorrowedUSD ?? 0), 0);

  // Mobile table: 3 columns (Asset, Supply APY, Borrow APY) instead of 6
  const tableCols   = isMobile ? "2fr 1fr 1fr" : "2fr 1fr 1fr 1fr 1fr 1fr";
  const tableHdrs   = isMobile
    ? ["Asset", "Supply APY", "Borrow APY"]
    : ["Asset", "Total Supplied", "Supply APY", "Total Borrowed", "Borrow APY", "Utilization"];

  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: isMobile ? "16px 16px" : "32px 24px" }}>

      {/* Scrolling price ticker */}
      <PriceTicker livePrice={livePrice} reserves={reserves} tokenList={tokenList} />

      {/* Header */}
      <div style={{ marginBottom: 32, borderBottom: "4px solid #000000", paddingBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? 32 : 48, marginBottom: 0 }}>
          MARKETS
        </h1>
      </div>

      {/* Stats */}
      <div
        className="col-1-mobile"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, marginBottom: 40, border: "4px solid #000000" }}
      >
        {[
          { label: "Total Market Size", value: fmtUSD(totalSupplied) },
          { label: "Total Borrowed",    value: fmtUSD(totalBorrowed) },
          { label: "Active Markets",    value: String(tokenList.length) },
        ].map(({ label, value }, i) => (
          <div key={label} style={{
            padding: isMobile ? "14px 16px" : "20px 24px",
            borderRight: !isMobile && i < 2 ? "4px solid #000000" : "none",
            borderBottom: isMobile && i < 2 ? "4px solid #000000" : "none",
          }}>
            <div style={{ ...colH, marginBottom: 8 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: isMobile ? 22 : 28, fontWeight: 700 }}>{value}</div>
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

        {/* Table — horizontal scroll on mobile */}
        <div className="scroll-x-mobile" style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: tableCols, gap: 8, padding: "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000", minWidth: isMobile ? "auto" : undefined }}>
            {tableHdrs.map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>

          {tokenList.map((t, i) => {
            const r    = reserves[t.symbol];
            const sup  = r?.totalSuppliedUSD ?? 0;
            const bor  = r?.totalBorrowedUSD ?? 0;
            const util = r?.utilization      ?? 0;
            const sApy = r?.supplyApy        ?? 0;
            const bApy = r?.borrowApy        ?? 0;

            return (
              <div key={t.symbol} style={{
                display: "grid", gridTemplateColumns: tableCols,
                gap: 8, padding: isMobile ? "12px 16px" : "16px 24px", alignItems: "center",
                borderBottom: i < tokenList.length - 1 ? "2px solid #000000" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TokenIcon symbol={t.symbol} size={28} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14 }}>{t.symbol}</div>
                    {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                  </div>
                </div>
                {!isMobile && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                      {sup !== null ? fmtUSD(sup) : "—"}
                    </div>
                  </div>
                )}
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#008000" }}>
                  {isLoading ? "..." : `${sApy.toFixed(2)}%`}
                </div>
                {!isMobile && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                    {bor !== null && bor > 0 ? fmtUSD(bor) : bor === null ? "—" : "$0.00"}
                  </div>
                )}
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: bApy > 0 ? "#FFA500" : "#999999" }}>
                  {isLoading ? "..." : bApy > 0 ? `${bApy.toFixed(2)}%` : "N/A"}
                </div>
                {!isMobile && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>
                      {isLoading ? "..." : `${util.toFixed(1)}%`}
                    </div>
                    <div style={{ marginTop: 4, height: 4, background: "#eeeeee", border: "1px solid #cccccc" }}>
                      <div style={{ height: "100%", width: `${Math.min(util, 100)}%`, background: util > 80 ? "#FF0000" : util > 60 ? "#FFA500" : "#008000" }} />
                    </div>
                  </div>
                )}
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

        {/* Table — horizontal scroll on mobile */}
        <div className="scroll-x-mobile" style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff", position: "relative" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: tableCols, gap: 8, padding: "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {tableHdrs.map(h => (
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
              display: "grid", gridTemplateColumns: tableCols,
              gap: 8, padding: isMobile ? "12px 16px" : "16px 24px", alignItems: "center",
              borderBottom: i < ARC_NATIVE_TOKENS.length - 1 ? "2px solid #000000" : "none",
              opacity: 0.4,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <TokenIcon symbol={t.symbol} size={28} />
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14 }}>{t.symbol}</div>
                  {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                </div>
              </div>
              {!isMobile && <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>{t.capacity}</div>}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>{t.supplyAPY}</div>
              {!isMobile && <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>—</div>}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>{t.borrowAPY}</div>
              {!isMobile && <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>—</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
