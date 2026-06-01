"use client";
import { useEffect, useState } from "react";

interface Liquidation {
  borrower:        string;
  liquidator:      string;
  collSymbol:      string;
  debtRepaid:      string;
  collateralSeized:string;
  txHash:          string;
  blockNumber:     string;
  byBot:           boolean;
}

interface BotData {
  botAddress:   string | null;
  botAgentId:   string | null;
  balances:     Record<string, string>;
  liquidations: Liquidation[];
  error?:       string;
}

export function BotStatusPanel() {
  const [data,    setData]    = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = () =>
      fetch("/api/bot-activity")
        .then(r => r.json())
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ border: "3px solid #000", padding: 24, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>LIQUIDATION BOT</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "#34c759", color: "#fff", padding: "3px 10px", borderRadius: 100 }}>
          LIVE
        </div>
      </div>

      {/* Bot wallet info */}
      {data?.botAddress && (
        <div style={{ border: "2px solid #e0e0e0", padding: "12px 16px", marginBottom: 20, background: "#fafafa" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#888", marginBottom: 8 }}>BOT WALLET</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginBottom: 8 }}>
            {data.botAddress.slice(0,10)}...{data.botAddress.slice(-6)}
            {data.botAgentId && <span style={{ marginLeft: 8, color: "#888" }}>ERC-8004 ID #{data.botAgentId}</span>}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {Object.entries(data.balances).map(([sym, bal]) => (
              <div key={sym} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                <span style={{ color: "#888", fontSize: 11 }}>{sym} </span>
                <strong>{parseFloat(bal).toLocaleString("en-US", { maximumFractionDigits: 4 })}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent liquidations */}
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, marginBottom: 12 }}>
        RECENT LIQUIDATIONS (last 10,000 blocks)
      </div>

      {loading && <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#888" }}>Loading...</div>}

      {!loading && data?.liquidations?.length === 0 && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#888" }}>
          No liquidations in recent blocks — protocol is healthy ✅
        </div>
      )}

      {data?.liquidations?.map((liq, i) => (
        <div key={i} style={{
          borderBottom: i < data.liquidations.length - 1 ? "1px solid #e0e0e0" : "none",
          padding: "10px 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {liq.byBot && <span style={{ background: "#000", color: "#fff", padding: "1px 6px", borderRadius: 3, marginRight: 6, fontSize: 10 }}>BOT</span>}
              Repaid <strong>{parseFloat(liq.debtRepaid).toLocaleString("en-US", { maximumFractionDigits: 2 })} xUSDC</strong>
              {" → "}seized <strong>{parseFloat(liq.collateralSeized).toFixed(4)} {liq.collSymbol}</strong>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#888", marginTop: 3 }}>
              Block #{liq.blockNumber} · {liq.borrower.slice(0,8)}...
            </div>
          </div>
          <a
            href={`https://testnet.arcscan.app/tx/${liq.txHash}`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#000", textDecoration: "underline" }}
          >
            TX ↗
          </a>
        </div>
      ))}
    </div>
  );
}
