"use client";

import { useState } from "react";
import { TokenIcon }     from "../shared/TokenIcon";
import { SupplyModal }   from "../modals/SupplyModal";
import { WithdrawModal } from "../modals/WithdrawModal";
import { useUserTokenBalances, useReserveData, useWalletBalances, TOKENS } from "../../hooks/use-lending-pool";
import { useIsMobile }   from "../../hooks/use-is-mobile";

const colH: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999",
};

export function SupplyPanel() {
  const [supplyToken,   setSupply]   = useState<string | null>(null);
  const [withdrawToken, setWithdraw] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const { supply }    = useUserTokenBalances();
  const { reserves }  = useReserveData();
  const { balances }  = useWalletBalances();

  const tokenList = Object.values(TOKENS);
  const activeSupplies = tokenList.filter(t => supply[t.symbol] > 0);

  // Mobile: "2fr 1fr 80px" (hide APY), Desktop: "2fr 1.2fr 0.8fr 90px"
  const supplyCols   = isMobile ? "2fr 1fr 80px"         : "2fr 1.2fr 0.8fr 90px";
  const supplyHdrs   = isMobile ? ["Asset", "Balance", ""] : ["Asset", "Balance", "APY", ""];
  const assetCols    = isMobile ? "2fr 1fr 80px"         : "2fr 0.8fr 0.8fr 80px";
  const assetHdrs    = isMobile ? ["Asset", "Wallet", ""] : ["Asset", "Wallet", "APY", ""];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Your Supplies */}
      <div style={{ border: "4px solid #000000", padding: isMobile ? 16 : 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Your Supplies
        </h4>
        {activeSupplies.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>Nothing supplied yet</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: supplyCols, gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
              {supplyHdrs.map(h => <span key={h} style={colH}>{h}</span>)}
            </div>
            {activeSupplies.map(t => {
              const r = reserves[t.symbol];
              const bal = supply[t.symbol];
              return (
                <div key={t.symbol} style={{ display: "grid", gridTemplateColumns: supplyCols, gap: 8, alignItems: "center", padding: "12px 0", borderBottom: "2px solid #000000" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TokenIcon symbol={t.symbol} size={28} />
                    <div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>{t.symbol}</div>
                      {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
                    {bal.toFixed(t.decimals === 8 ? 6 : 2)}
                  </span>
                  {!isMobile && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#008000", fontWeight: 700 }}>
                      {r ? `${r.supplyApy.toFixed(2)}%` : "—"}
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setWithdraw(t.symbol)}>Withdraw</button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Assets to Supply */}
      <div style={{ border: "4px solid #000000", padding: isMobile ? 16 : 24, background: "#ffffff" }}>
        <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
          Assets to Supply
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: assetCols, gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: "3px solid #000000" }}>
          {assetHdrs.map(h => <span key={h} style={colH}>{h}</span>)}
        </div>
        {tokenList.map(t => {
          const r   = reserves[t.symbol];
          const bal = balances[t.symbol];
          return (
            <div key={t.symbol} style={{ display: "grid", gridTemplateColumns: assetCols, gap: 8, alignItems: "center", padding: "12px 0", borderBottom: "2px solid #000000" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TokenIcon symbol={t.symbol} size={28} />
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600 }}>{t.symbol}</div>
                  {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#999999" }}>
                {bal > 0 ? bal.toFixed(t.decimals === 8 ? 6 : 2) : "0.00"}
              </span>
              {!isMobile && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#008000", fontWeight: 700 }}>
                  {r ? `${r.supplyApy.toFixed(2)}%` : "—"}
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setSupply(t.symbol)}>Supply</button>
            </div>
          );
        })}
      </div>

      {supplyToken   && <SupplyModal  symbol={supplyToken}   onClose={() => setSupply(null)} />}
      {withdrawToken && <WithdrawModal symbol={withdrawToken} onClose={() => setWithdraw(null)} />}
    </div>
  );
}
