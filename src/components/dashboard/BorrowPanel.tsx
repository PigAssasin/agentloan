"use client";

import { useState } from "react";
import { TokenIcon }   from "../shared/TokenIcon";
import { BorrowModal } from "../modals/BorrowModal";
import { RepayModal }  from "../modals/RepayModal";
import { MOCK_RESERVES, MOCK_POSITIONS, MOCK_ACCOUNT } from "../../lib/mock-data";

const colH: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999",
};

export function BorrowPanel() {
  const [showBorrow, setBorrow] = useState(false);
  const [showRepay,  setRepay]  = useState(false);

  const totalDebt  = Number(MOCK_ACCOUNT.totalDebtUSD) / 1e6;
  const totalAvail = Number(MOCK_ACCOUNT.availableBorrowsUSD) / 1e6;
  const limitPct   = (totalDebt + totalAvail) > 0
    ? Math.round((totalDebt / (totalDebt + totalAvail)) * 100)
    : 0;
  const usdcR      = MOCK_RESERVES.find(r => r.symbol === "USDC");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Your Borrows */}
      <div style={{ border: "4px solid #000000", padding: 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Your Borrows
        </h4>
        {MOCK_POSITIONS.borrowed.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>Nothing borrowed yet</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.8fr 80px", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
              {["Asset", "Debt", "APY", ""].map(h => <span key={h} style={colH}>{h}</span>)}
            </div>
            {MOCK_POSITIONS.borrowed.map(p => (
              <div key={p.symbol} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.8fr 80px", gap: 8, alignItems: "center", padding: "12px 0", borderBottom: "2px solid #000000" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <TokenIcon symbol={p.symbol} size={28} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>{p.symbol}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{p.amountUSD}</div>
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{p.amount}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#FFA500", fontWeight: 700 }}>{p.apy}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setRepay(true)}>Repay</button>
              </div>
            ))}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "2px solid #000000" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ ...colH }}>Borrow Limit Used</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>{limitPct}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${limitPct}%`, background: limitPct > 80 ? "#FF0000" : limitPct > 60 ? "#FFA500" : "#008000" }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assets to Borrow */}
      <div style={{ border: "4px solid #000000", padding: 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Assets to Borrow
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 80px", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
          {["Asset", "Available", "APY", ""].map(h => <span key={h} style={colH}>{h}</span>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 80px", gap: 8, alignItems: "center", padding: "12px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TokenIcon symbol="USDC" size={28} />
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>USDC</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>USD Coin</div>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>$2,060</div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#FFA500", fontWeight: 700 }}>
            {usdcR?.borrowAPY ?? "1.36%"}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setBorrow(true)}>Borrow</button>
        </div>
      </div>

      {showBorrow && <BorrowModal onClose={() => setBorrow(false)} />}
      {showRepay  && <RepayModal  onClose={() => setRepay(false)} />}
    </div>
  );
}
