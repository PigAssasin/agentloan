"use client";

import { useState } from "react";
import { TokenIcon }     from "../shared/TokenIcon";
import { SupplyModal }   from "../modals/SupplyModal";
import { WithdrawModal } from "../modals/WithdrawModal";
import { MOCK_RESERVES, MOCK_POSITIONS } from "../../lib/mock-data";

const TOKENS = ["cirBTC", "EURC", "USDC"] as const;

const colH: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999",
};

export function SupplyPanel() {
  const [supplyToken,   setSupply]   = useState<string | null>(null);
  const [withdrawToken, setWithdraw] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Your Supplies */}
      <div style={{ border: "4px solid #000000", padding: 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Your Supplies
        </h4>
        {MOCK_POSITIONS.supplied.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>Nothing supplied yet</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.8fr 90px", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
              {["Asset", "Balance", "APY", ""].map(h => <span key={h} style={colH}>{h}</span>)}
            </div>
            {MOCK_POSITIONS.supplied.map(p => (
              <div key={p.symbol} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.8fr 90px", gap: 8, alignItems: "center", padding: "12px 0", borderBottom: "2px solid #000000" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <TokenIcon symbol={p.symbol} size={28} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>{p.symbol}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{p.amountUSD}</div>
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{p.amount}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#008000", fontWeight: 700 }}>{p.apy}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setWithdraw(p.symbol)}>Withdraw</button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Assets to Supply */}
      <div style={{ border: "4px solid #000000", padding: 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Assets to Supply
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 80px", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
          {["Asset", "Wallet", "APY", ""].map(h => <span key={h} style={colH}>{h}</span>)}
        </div>
        {TOKENS.map(sym => {
          const r = MOCK_RESERVES.find(x => x.symbol === sym);
          return (
            <div key={sym} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 80px", gap: 8, alignItems: "center", padding: "12px 0", borderBottom: "2px solid #000000" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TokenIcon symbol={sym} size={28} />
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>{sym}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{r?.name}</div>
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>0.00</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#008000", fontWeight: 700 }}>{r?.supplyAPY ?? "N/A"}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSupply(sym)}>Supply</button>
            </div>
          );
        })}
      </div>

      {supplyToken   && <SupplyModal  symbol={supplyToken}   onClose={() => setSupply(null)} />}
      {withdrawToken && <WithdrawModal symbol={withdrawToken} onClose={() => setWithdraw(null)} />}
    </div>
  );
}
