"use client";

import { HealthFactorBanner } from "../../components/dashboard/HealthFactorBanner";
import { SupplyPanel }        from "../../components/dashboard/SupplyPanel";
import { BorrowPanel }        from "../../components/dashboard/BorrowPanel";
import { MOCK_ACCOUNT }       from "../../lib/mock-data";

const netWorth  = (Number(MOCK_ACCOUNT.totalCollateralUSD) - Number(MOCK_ACCOUNT.totalDebtUSD)) / 1e6;
const supplied  = Number(MOCK_ACCOUNT.totalCollateralUSD) / 1e6;
const borrowed  = Number(MOCK_ACCOUNT.totalDebtUSD) / 1e6;

export default function DashboardPage() {
  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: "32px 24px" }}>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, marginBottom: 32, border: "4px solid #000000" }}>
        {[
          { label: "Net Worth",      value: `$${netWorth.toFixed(2)}` },
          { label: "Total Supplied", value: `$${supplied.toFixed(2)}` },
          { label: "Total Borrowed", value: `$${borrowed.toFixed(2)}` },
        ].map(({ label, value }, i) => (
          <div key={label} style={{
            padding: "24px 28px",
            borderRight: i < 2 ? "4px solid #000000" : "none",
            background: "#ffffff",
          }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 10 }}>
              {label}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700, color: "#000000", lineHeight: 1 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <HealthFactorBanner healthFactor={MOCK_ACCOUNT.healthFactor} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <SupplyPanel />
        <BorrowPanel />
      </div>
    </div>
  );
}
