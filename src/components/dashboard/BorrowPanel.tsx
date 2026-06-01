"use client";

import { useState } from "react";
import { TokenIcon }   from "../shared/TokenIcon";
import { BorrowModal } from "../modals/BorrowModal";
import { RepayModal }  from "../modals/RepayModal";
import { useUserAccountData, useUserTokenBalances, useReserveData, TOKENS } from "../../hooks/use-lending-pool";
import { useIsMobile } from "../../hooks/use-is-mobile";

const colH: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999",
};

export function BorrowPanel() {
  const [borrowToken, setBorrow] = useState<string | null>(null);
  const [repayToken,  setRepay]  = useState<string | null>(null);
  const isMobile = useIsMobile();

  const { totalDebtUSD, availableBorrows } = useUserAccountData();
  const { borrow }  = useUserTokenBalances();
  const { reserves } = useReserveData();

  const tokenList    = Object.values(TOKENS);
  const activeBorrows = tokenList.filter(t => borrow[t.symbol] > 0);
  const borrowableTokens = tokenList.filter(t => t.borrowable);

  const limitPct = (totalDebtUSD + availableBorrows) > 0
    ? Math.round((totalDebtUSD / (totalDebtUSD + availableBorrows)) * 100)
    : 0;

  // Mobile: hide APY column
  const borrowCols = isMobile ? "2fr 1fr 80px"         : "2fr 1.2fr 0.8fr 80px";
  const borrowHdrs = isMobile ? ["Asset", "Debt", ""] : ["Asset", "Debt", "APY", ""];
  const assetCols  = isMobile ? "2fr 1fr 80px"         : "2fr 0.8fr 0.8fr 80px";
  const assetHdrs  = isMobile ? ["Asset", "Avail", ""] : ["Asset", "Available", "APY", ""];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Your Borrows */}
      <div style={{ border: "4px solid #000000", padding: isMobile ? 16 : 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Your Borrows
        </h4>
        {activeBorrows.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>Nothing borrowed yet</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: borrowCols, gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
              {borrowHdrs.map(h => <span key={h} style={colH}>{h}</span>)}
            </div>
            {activeBorrows.map(t => {
              const r   = reserves[t.symbol];
              const debt = borrow[t.symbol];
              return (
                <div key={t.symbol} style={{ display: "grid", gridTemplateColumns: borrowCols, gap: 8, alignItems: "center", padding: "12px 0", borderBottom: "2px solid #000000" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TokenIcon symbol={t.symbol} size={28} />
                    <div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>{t.symbol}</div>
                      {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
                    {debt.toFixed(t.decimals === 8 ? 6 : 2)}
                  </span>
                  {!isMobile && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#FFA500", fontWeight: 700 }}>
                      {r ? `${r.borrowApy.toFixed(2)}%` : "—"}
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setRepay(t.symbol)}>Repay</button>
                </div>
              );
            })}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "2px solid #000000" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={colH}>Borrow Limit Used</span>
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
      <div style={{ border: "4px solid #000000", padding: isMobile ? 16 : 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Assets to Borrow
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: assetCols, gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
          {assetHdrs.map(h => <span key={h} style={colH}>{h}</span>)}
        </div>
        {borrowableTokens.map(t => {
          const r = reserves[t.symbol];
          return (
            <div key={t.symbol} style={{ display: "grid", gridTemplateColumns: assetCols, gap: 8, alignItems: "center", padding: "12px 0", borderBottom: "2px solid #000000" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TokenIcon symbol={t.symbol} size={28} />
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>{t.symbol}</div>
                  {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
                ${availableBorrows.toFixed(2)}
              </div>
              {!isMobile && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#FFA500", fontWeight: 700 }}>
                  {r ? `${r.borrowApy.toFixed(2)}%` : "—"}
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setBorrow(t.symbol)}>Borrow</button>
            </div>
          );
        })}
      </div>

      {borrowToken && <BorrowModal token={borrowToken} onClose={() => setBorrow(null)} />}
      {repayToken  && <RepayModal  token={repayToken}  onClose={() => setRepay(null)} />}
    </div>
  );
}
