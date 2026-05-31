"use client";

import { useState } from "react";
import { TokenIcon }     from "../../components/shared/TokenIcon";
import { WithdrawModal } from "../../components/modals/WithdrawModal";
import { RepayModal }    from "../../components/modals/RepayModal";
import { MOCK_ACCOUNT, MOCK_POSITIONS } from "../../lib/mock-data";

function hfColor(hf: bigint): string {
  const WAD = 10n ** 18n, MAX = 2n ** 256n - 1n;
  if (hf === MAX || hf === 0n)        return "#008000";
  if (hf >= (15n * WAD) / 10n)        return "#008000";
  if (hf >= WAD)                       return "#FFA500";
  return "#FF0000";
}

function hfFormat(hf: bigint): string {
  const MAX = 2n ** 256n - 1n;
  if (hf === MAX || hf === 0n) return "∞";
  const v = Number(hf) / 1e18;
  return v > 99 ? "∞" : v.toFixed(2);
}

function hfLabel(hf: bigint): string {
  const WAD = 10n ** 18n, MAX = 2n ** 256n - 1n;
  if (hf === MAX || hf === 0n)        return "SAFE";
  if (hf >= (15n * WAD) / 10n)        return "SAFE";
  if (hf >= WAD)                       return "AT RISK";
  return "LIQUIDATABLE";
}

const colH: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999",
};

export default function ProfilePage() {
  const [withdrawSymbol, setWithdraw] = useState<string | null>(null);
  const [showRepay, setRepay]         = useState(false);

  const hf          = MOCK_ACCOUNT.healthFactor;
  const hfClr       = hfColor(hf);
  const hfVal       = hfFormat(hf);
  const hfLbl       = hfLabel(hf);
  const netWorth    = (Number(MOCK_ACCOUNT.totalCollateralUSD) - Number(MOCK_ACCOUNT.totalDebtUSD)) / 1e6;
  const collateral  =  Number(MOCK_ACCOUNT.totalCollateralUSD) / 1e6;
  const debt        =  Number(MOCK_ACCOUNT.totalDebtUSD) / 1e6;
  const available   =  Number(MOCK_ACCOUNT.availableBorrowsUSD) / 1e6;
  const limitUsed   = debt > 0 ? Math.round((debt / (debt + available)) * 100) : 0;

  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: "32px 24px" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 32, borderBottom: "4px solid #000000", paddingBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 48 }}>
          PROFILE
        </h1>
      </div>

      {/* ── Account summary — 4 stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, marginBottom: 32, border: "4px solid #000000" }}>
        {[
          { label: "Net Worth",           value: `$${netWorth.toFixed(2)}`,   color: "#000000" },
          { label: "Health Factor",       value: hfVal,                        color: hfClr     },
          { label: "Total Collateral",    value: `$${collateral.toFixed(2)}`, color: "#000000" },
          { label: "Available to Borrow", value: `$${available.toFixed(2)}`,  color: "#000000" },
        ].map(({ label, value, color }, i) => (
          <div key={label} style={{
            padding: "20px 24px",
            borderRight: i < 3 ? "4px solid #000000" : "none",
            background: "#ffffff",
          }}>
            <div style={{ ...colH, marginBottom: 10 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
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
        ))}
      </div>

      {/* ── Borrow limit bar ── */}
      {debt > 0 && (
        <div style={{ border: "3px solid #000000", padding: "16px 24px", marginBottom: 32, background: "#ffffff" }}>
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
              ${debt.toFixed(2)} borrowed
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999" }}>
              ${available.toFixed(2)} available
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
        <div style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px", gap: 8, padding: "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {["Asset", "Balance", "Value (USD)", "Supply APY", "Earnings", ""].map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>

          {MOCK_POSITIONS.supplied.length === 0 ? (
            <div style={{ padding: "32px 24px" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>
                No supplied positions yet. Supply assets to start earning.
              </p>
            </div>
          ) : (
            MOCK_POSITIONS.supplied.map((p, i) => (
              <div key={p.symbol} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px",
                gap: 8, padding: "16px 24px", alignItems: "center",
                borderBottom: i < MOCK_POSITIONS.supplied.length - 1 ? "2px solid #000000" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TokenIcon symbol={p.symbol} size={32} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{p.symbol}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>Collateral</div>
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>{p.amount}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{p.amountUSD}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#008000" }}>{p.apy}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#008000" }}>+$0.42/day</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setWithdraw(p.symbol)}>
                  Withdraw
                </button>
              </div>
            ))
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
        <div style={{ border: "4px solid #000000", borderTop: "none", background: "#ffffff" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px", gap: 8, padding: "10px 24px", background: "#f5f5f5", borderBottom: "3px solid #000000" }}>
            {["Asset", "Debt", "Value (USD)", "Borrow APY", "Accrued", ""].map(h => (
              <span key={h} style={colH}>{h}</span>
            ))}
          </div>

          {MOCK_POSITIONS.borrowed.length === 0 ? (
            <div style={{ padding: "32px 24px" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999" }}>
                No borrowed positions yet.
              </p>
            </div>
          ) : (
            MOCK_POSITIONS.borrowed.map((p, i) => (
              <div key={p.symbol} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px",
                gap: 8, padding: "16px 24px", alignItems: "center",
                borderBottom: i < MOCK_POSITIONS.borrowed.length - 1 ? "2px solid #000000" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <TokenIcon symbol={p.symbol} size={32} />
                  <div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{p.symbol}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>Variable rate</div>
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700 }}>{p.amount}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>{p.amountUSD}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#FFA500" }}>{p.apy}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#FFA500" }}>-$0.19/day</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setRepay(true)}>
                  Repay
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Risk parameters ── */}
      <div style={{ border: "4px solid #000000", background: "#ffffff" }}>
        <div style={{ background: "#000000", padding: "12px 24px" }}>
          <h4 style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#ffffff" }}>
            Risk Parameters
          </h4>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0 }}>
          {[
            { label: "Liquidation Threshold", value: "75% (cirBTC) · 85% (EURC)", note: "Position liquidated below threshold" },
            { label: "Liquidation Penalty",   value: "10% (cirBTC) · 5% (EURC)",  note: "Penalty on seized collateral" },
            { label: "Oracle Staleness",       value: "Max 3600s",                  note: "Chainlink price feed freshness" },
          ].map(({ label, value, note }, i) => (
            <div key={label} style={{
              padding: "20px 24px",
              borderRight: i < 2 ? "3px solid #000000" : "none",
            }}>
              <div style={{ ...colH, marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{value}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{note}</div>
            </div>
          ))}
        </div>
      </div>

      {withdrawSymbol && <WithdrawModal symbol={withdrawSymbol} onClose={() => setWithdraw(null)} />}
      {showRepay      && <RepayModal token="xUSDC" onClose={() => setRepay(false)} />}
    </div>
  );
}
