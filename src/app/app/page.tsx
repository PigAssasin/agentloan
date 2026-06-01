"use client";

import { useState }           from "react";
import { HealthFactorBanner } from "../../components/dashboard/HealthFactorBanner";
import { SupplyPanel }        from "../../components/dashboard/SupplyPanel";
import { BorrowPanel }        from "../../components/dashboard/BorrowPanel";
import { AgentsTab }          from "../../components/agents/AgentsTab";
import { JobsTab }            from "../../components/agents/JobsTab";
import { useUserAccountData } from "../../hooks/use-lending-pool";
import { useIsMobile }        from "../../hooks/use-is-mobile";

const TABS = ["POSITIONS", "AGENTS", "JOBS"] as const;
type Tab = typeof TABS[number];

export default function DashboardPage() {
  const {
    totalCollateralUSD,
    totalDebtUSD,
    healthFactorRaw,
    healthFactor: hfString,
  } = useUserAccountData();

  const isMobile  = useIsMobile();
  const [tab, setTab] = useState<Tab>("POSITIONS");
  const netWorth  = totalCollateralUSD - totalDebtUSD;

  return (
    <div style={{ maxWidth: "var(--page-max-width)", margin: "0 auto", padding: isMobile ? "16px 16px" : "32px 24px" }}>

      {/* Stats row */}
      <div
        className="col-1-mobile"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, marginBottom: 32, border: "4px solid #000000" }}
      >
        {[
          { label: "Net Worth",      value: `$${netWorth.toFixed(2)}` },
          { label: "Total Supplied", value: `$${totalCollateralUSD.toFixed(2)}` },
          { label: "Total Borrowed", value: `$${totalDebtUSD.toFixed(2)}` },
        ].map(({ label, value }, i) => (
          <div key={label} style={{
            padding: isMobile ? "16px 20px" : "24px 28px",
            borderRight: !isMobile && i < 2 ? "4px solid #000000" : "none",
            borderBottom: isMobile && i < 2 ? "4px solid #000000" : "none",
            background: "#ffffff",
          }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 10 }}>
              {label}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: isMobile ? 24 : 36, fontWeight: 700, color: "#000000", lineHeight: 1 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <HealthFactorBanner healthFactor={healthFactorRaw} hfString={hfString} />

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "3px solid #000", marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: "var(--font-heading)", fontSize: 13,
            padding: "10px 20px",
            background: tab === t ? "#000" : "transparent",
            color:      tab === t ? "#fff" : "#000",
            border: "none", cursor: "pointer",
            borderBottom: tab === t ? "3px solid #000" : "none",
            marginBottom: tab === t ? "-3px" : 0,
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "POSITIONS" && (
        <div className="col-1-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <SupplyPanel />
          <BorrowPanel />
        </div>
      )}
      {tab === "AGENTS" && <AgentsTab />}
      {tab === "JOBS"   && <JobsTab />}
    </div>
  );
}
