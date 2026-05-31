import { DocPage, InfoBox, WarnBox, Table } from "../_components/DocPage";

export default function HealthFactorPage() {
  return (
    <DocPage
      title="Health Factor"
      description="The Health Factor (HF) measures the safety of your borrow position. Keep it above 1.0 to avoid liquidation."
      prev={{ label: "How to Repay", href: "/docs/repay" }}
      next={{ label: "APY & Interest", href: "/docs/apy" }}
    >
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>FORMULA</h2>
      <div style={{ border: "3px solid #000", padding: "24px", background: "#f9f9f9", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 14, lineHeight: 2 }}>
        HF = Σ(collateral_value × liquidation_threshold) / total_debt
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.8, color: "#444", marginBottom: 32 }}>
        The numerator uses the <strong>liquidation threshold</strong> (more conservative than LTV).
        This means a position can still be healthy even if it's above the borrow LTV limit —
        it only becomes liquidatable when collateral × liquidation_threshold falls below debt.
      </p>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>THRESHOLDS</h2>

      <Table
        headers={["Health Factor", "Status", "Meaning"]}
        rows={[
          ["∞", "🟢 Safe", "No active debt"],
          ["> 2.0", "🟢 Safe", "Well collateralized"],
          ["1.0 – 2.0", "🟡 At Risk", "Monitor regularly"],
          ["< 1.0", "🔴 Liquidatable", "Can be liquidated by anyone"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>EXAMPLE</h2>
      <div style={{ border: "3px solid #000", padding: "24px", marginBottom: 32 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2.2 }}>
          <div>Supply: 0.1 xclrBTC at $60,000 = <strong>$6,000 collateral</strong></div>
          <div>Liquidation threshold for xclrBTC: <strong>75%</strong></div>
          <div>Weighted collateral: $6,000 × 75% = <strong>$4,500</strong></div>
          <div>Borrow: <strong>$3,000 xUSDC</strong></div>
          <div style={{ borderTop: "2px solid #000", marginTop: 8, paddingTop: 8 }}>
            HF = $4,500 / $3,000 = <strong>1.5 ✓ Safe</strong>
          </div>
        </div>
      </div>
      <div style={{ border: "3px solid #000", padding: "24px", marginBottom: 32, background: "#fff3f3" }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, color: "#FF0000" }}>After BTC price drops to $40,000</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2.2 }}>
          <div>New collateral: 0.1 × $40,000 × 75% = <strong>$3,000</strong></div>
          <div>Debt: <strong>$3,000 xUSDC</strong></div>
          <div style={{ borderTop: "2px solid #000", marginTop: 8, paddingTop: 8 }}>
            HF = $3,000 / $3,000 = <strong>1.0 → LIQUIDATABLE</strong>
          </div>
        </div>
      </div>

      <WarnBox>
        <strong>⚠ Health Factor changes constantly</strong> — your collateral price fluctuates and your debt grows with accrued interest.
        Check your position regularly, especially when borrowing close to your LTV limit.
      </WarnBox>

      <InfoBox title="How to improve your HF">
        1. <strong>Repay debt</strong> — reduces the denominator<br />
        2. <strong>Supply more collateral</strong> — increases the numerator<br />
        3. <strong>Withdraw less</strong> — keep collateral in the pool
      </InfoBox>
    </DocPage>
  );
}
