"use client";

import { useState } from "react";
import { TokenIcon }        from "../../components/shared/TokenIcon";
import { WithdrawModal }    from "../../components/modals/WithdrawModal";
import { RepayModal }       from "../../components/modals/RepayModal";
import {
  TOKENS,
  useUserAccountData,
  useUserTokenBalances,
  useWalletBalances,
  useReserveData,
} from "../../hooks/use-lending-pool";
import { useIsMobile } from "../../hooks/use-is-mobile";

function hfColor(hf: string): string {
  if (hf === "∞") return "#008000";
  const v = parseFloat(hf);
  if (isNaN(v)) return "#008000";
  if (v >= 1.5)  return "#008000";
  if (v >= 1.0)  return "#FFA500";
  return "#FF0000";
}

function hfLabel(hf: string): string {
  if (hf === "∞") return "SAFE";
  const v = parseFloat(hf);
  if (isNaN(v))  return "SAFE";
  if (v >= 1.5)  return "SAFE";
  if (v >= 1.0)  return "AT RISK";
  return "LIQUIDATABLE";
}

const colH: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999",
};

export default function ProfilePage() {
  const [withdrawSymbol, setWithdraw] = useState<string | null>(null);
  const [repaySymbol, setRepay]       = useState<string | null>(null);
  const isMobile = useIsMobile();

  const { totalCollateralUSD, totalDebtUSD, availableBorrows, healthFactor } = useUserAccountData();
  const { supply, borrow, refetch: refetchBalances } = useUserTokenBalances();
  const { balances: walletBalances } = useWalletBalances();
  const { reserves } = useReserveData();

  const tokenList = Object.values(TOKENS);
  const suppliedPositions = tokenList.filter(t => (supply[t.symbol] ?? 0) > 0);
  const borrowedPositions = tokenList.filter(t => (borrow[t.symbol] ?? 0) > 0);

  const netWorth  = totalCollateralUSD - totalDebtUSD;
  const limitUsed = totalDebtUSD > 0 ? Math.round((totalDebtUSD / (totalDebtUSD + availableBorrows)) * 100) : 0;

  const hfClr = hfColor(healthFactor);
  const hfLbl = hfLabel(healthFactor);

  // 4-col desktop → 2-col mobile for stats
  const statsCols = isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)";

  // Supplied positions table columns
  const supplyCols = isMobile ? "2fr 1fr 100px" : "2fr 1fr 1fr 1fr 100px";
  const supplyHdrs = isMobile ? ["Asset", "Balance", ""] : ["Asset", "Balance", "Supply APY", "Collateral", ""];

  // Borrowed positions table columns
  const borrowCols = isMobile ? "2fr 1fr 100px" : "2fr 1fr 1fr 100px";
  const borrowHdrs = isMobile ? ["Asset", "Debt", ""] : ["Asset", "Debt", "Borrow APY", ""];

  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: isMobile ? "16px 16px" : "32px 24px" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 32, borderBottom: "4px solid #000000", paddingBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: isMobile ? 32 : 48 }}>
          PROFILE
        </h1>
      </div>

      {/* ── Account summary — 4 stats (2×2 on mobile) ── */}
      <div style={{ display: "grid", gridTemplateColumns: statsCols, gap: 0, marginBottom: 32, border: "4px solid #000000" }}>
        {[
          { label: "Net Worth",           value: `$${netWorth.toFixed(2)}`,              color: "#000000" },
          { label: "Health Factor",       value: healthFactor,  color: hfClr     },
          { label: "Total Collateral",    value: `$${totalCollateralUSD.toFixed(2)}`,    color: "#000000" },
          { label: "Available to Borrow", value: `$${availableBorrows.toFixed(2)}`,      color: "#000000" },
        ].map(({ label, value, color }, i) => {
          const isLastInRow = isMobile ? (i % 2 === 1) : (i === 3);
          const isLastRow   = isMobile ? (i >= 2) : true;
          return (
            <div key={label} style={{
              padding: isMobile ? "14px 16px" : "20px 24px",
              borderRight:  !isLastInRow ? "4px solid #000000" : "none",
              borderBottom: isMobile && !isLastRow ? "4px solid #000000" : "none",
              background: "#ffffff",
            }}>
              <div style={{ ...colH, marginBottom: 10 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: isMobile ? 20 : 28, fontWeight: 700, color, lineHeight: 1 }}>
                {value}
              </div>
              {label === "Health Factor" && (
                <div style={{
                  marginTop: 8,
                  display: "inline-flex",
                  padding: "2px 8px",
                  border: `2px solid ${hfClr}`,
                  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.08em", color: hfClr,
                }}>
                  {hfLbl}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Borrow limit bar ── */}
      {totalDebtUSD > 0 && (
        <div style={{ border: "3px solid #000000", padding: isMobile ? "14px 16px" : "16px 24px", marginBottom: 32, background: "#ffffff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ ...colH }}>Borrow Limit Used</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>{limitUsed}%</span>
          </div>
          <div style={{ height: 6, background: "#eeeeee", border: "1px solid #000000" }}>
            <div style={{
              height: "100%",
              width: `${limitUsed}%`,
              background: limitUsed > 80 ? "#FF0000" : limitUsed > 60 ? "#FFA500" : "#008000",
              transition: "width 0.4s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999" }}>
              ${totalDebtUSD.toFixed(2)} borrowed
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999" }}>
              ${availableBorrows.toFixed(2)} available
            </span>
          </div>
        </div>
      )}

      {/* ── Supplied Positions ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ background: "#000000", padding: "12px 24px", borderLeft: "4px solid #000000", borderRight: "4px solid #000000", borderTop: "4px solid #000000" }}>
          <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ffffff" }}>
            Supplied Positions
          </h4>
        </div>
        <div className="scroll-x-mobile" style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff" }}>
          <div style={{ display: "grid", gridTemplateColumns: supplyCols, gap: 8, padding: isMobile ? "10px 16px" : "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {supplyHdrs.map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>

          {suppliedPositions.length === 0 ? (
            <div style={{ padding: "32px 24px" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>
                Nothing supplied yet. Supply assets to start earning.
              </p>
            </div>
          ) : (
            suppliedPositions.map((t, i) => {
              const bal = supply[t.symbol] ?? 0;
              const apy = reserves[t.symbol]?.supplyApy ?? 0;
              return (
                <div key={t.symbol} style={{
                  display: "grid", gridTemplateColumns: supplyCols,
                  gap: 8, padding: isMobile ? "12px 16px" : "16px 24px", alignItems: "center",
                  borderBottom: i < suppliedPositions.length - 1 ? "2px solid #000000" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <TokenIcon symbol={t.symbol} size={32} />
                    <div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{t.symbol}</div>
                      {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                    {t.decimals === 8 ? bal.toFixed(8) : bal.toFixed(2)}
                  </span>
                  {!isMobile && (
                    <>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#008000" }}>
                        {apy.toFixed(2)}%
                      </span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#008000" }}>Yes</span>
                    </>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setWithdraw(t.symbol)}>
                    Withdraw
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Borrowed Positions ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ background: "#000000", padding: "12px 24px", borderLeft: "4px solid #000000", borderRight: "4px solid #000000", borderTop: "4px solid #000000" }}>
          <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ffffff" }}>
            Borrowed Positions
          </h4>
        </div>
        <div className="scroll-x-mobile" style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff" }}>
          <div style={{ display: "grid", gridTemplateColumns: borrowCols, gap: 8, padding: isMobile ? "10px 16px" : "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {borrowHdrs.map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>

          {borrowedPositions.length === 0 ? (
            <div style={{ padding: "32px 24px" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>
                Nothing borrowed yet.
              </p>
            </div>
          ) : (
            borrowedPositions.map((t, i) => {
              const debt = borrow[t.symbol] ?? 0;
              const apy  = reserves[t.symbol]?.borrowApy ?? 0;
              return (
                <div key={t.symbol} style={{
                  display: "grid", gridTemplateColumns: borrowCols,
                  gap: 8, padding: isMobile ? "12px 16px" : "16px 24px", alignItems: "center",
                  borderBottom: i < borrowedPositions.length - 1 ? "2px solid #000000" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <TokenIcon symbol={t.symbol} size={32} />
                    <div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{t.symbol}</div>
                      {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>Variable rate</div>}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                    {t.decimals === 8 ? debt.toFixed(8) : debt.toFixed(2)}
                  </span>
                  {!isMobile && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#FFA500" }}>
                      {apy.toFixed(2)}%
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setRepay(t.symbol)}>
                    Repay
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Wallet Balances ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ background: "#000000", padding: "12px 24px", borderLeft: "4px solid #000000", borderRight: "4px solid #000000", borderTop: "4px solid #000000" }}>
          <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ffffff" }}>
            Wallet Balances
          </h4>
        </div>
        <div style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, padding: isMobile ? "10px 16px" : "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {["Asset", "Balance"].map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>
          {tokenList.map((t, i) => {
            const bal = walletBalances[t.symbol] ?? 0;
            return (
              <div key={t.symbol} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr",
                gap: 8, padding: isMobile ? "12px 16px" : "16px 24px", alignItems: "center",
                borderBottom: i < tokenList.length - 1 ? "2px solid #000000" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TokenIcon symbol={t.symbol} size={32} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{t.symbol}</div>
                    {!isMobile && <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{t.name}</div>}
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>
                  {t.decimals === 8 ? bal.toFixed(8) : bal.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Risk parameters ── */}
      <div style={{ border: "4px solid #000000", background: "#ffffff" }}>
        <div style={{ background: "#000000", padding: "12px 24px" }}>
          <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ffffff" }}>
            Risk Parameters
          </h4>
        </div>
        <div
          className="col-1-mobile"
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0 }}
        >
          {[
            { label: "Liquidation Threshold", value: "75% (xclrBTC) · 85% (xEURC)", note: "Position liquidated below threshold" },
            { label: "Liquidation Penalty",   value: "10% (xclrBTC) · 5% (xEURC)",  note: "Penalty on seized collateral" },
            { label: "Oracle Staleness",       value: "Max 3600s",                    note: "Chainlink price feed freshness" },
          ].map(({ label, value, note }, i) => (
            <div key={label} style={{
              padding: isMobile ? "14px 16px" : "20px 24px",
              borderRight: !isMobile && i < 2 ? "3px solid #000000" : "none",
              borderBottom: isMobile && i < 2 ? "3px solid #000000" : "none",
            }}>
              <div style={{ ...colH, marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{value}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{note}</div>
            </div>
          ))}
        </div>
      </div>

      {withdrawSymbol && <WithdrawModal symbol={withdrawSymbol} onClose={() => setWithdraw(null)} />}
      {repaySymbol    && <RepayModal token={repaySymbol} onClose={() => setRepay(null)} />}
    </div>
  );
}
