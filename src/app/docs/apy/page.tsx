import { DocPage, InfoBox, Table } from "../_components/DocPage";

export default function ApyPage() {
  return (
    <DocPage
      title="APY & Interest"
      description="AgentLoan uses a variable 2-slope interest rate model. Rates change automatically based on pool utilization."
      prev={{ label: "Health Factor", href: "/docs/health-factor" }}
      next={{ label: "Liquidations", href: "/docs/liquidations" }}
    >
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>INTEREST RATE MODEL</h2>
      <div style={{ border: "3px solid #000", padding: "24px", background: "#f9f9f9", marginBottom: 24, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2.2 }}>
        <div>If utilization ≤ 80% (kink):</div>
        <div style={{ paddingLeft: 24 }}>BorrowAPY = 5% + (4% × utilization / 80%)</div>
        <div style={{ marginTop: 8 }}>If utilization &gt; 80%:</div>
        <div style={{ paddingLeft: 24 }}>BorrowAPY = 9% + (145% × (util - 80%) / 20%)</div>
        <div style={{ marginTop: 8, borderTop: "2px solid #000", paddingTop: 8 }}>
          SupplyAPY = BorrowAPY × utilization
        </div>
      </div>

      <Table
        headers={["Utilization", "Borrow APY", "Supply APY"]}
        rows={[
          ["0%", "5.0%", "0.0%"],
          ["40%", "7.0%", "2.8%"],
          ["60%", "8.0%", "4.8%"],
          ["80% ← kink", "9.0%", "7.2%"],
          ["90%", "81.5%", "73.4%"],
          ["100%", "154%", "154%"],
        ]}
      />

      <InfoBox title="Why does Supply APY stay low when utilization is low?">
        Supply APY = Borrow APY × utilization. If only 1% of supplied funds are borrowed,
        suppliers only earn 1% of the borrow interest — even if the borrow rate is high.
        Suppliers earn more when the pool is heavily utilized.
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>HOW INTEREST IS STORED (SCALED BALANCES)</h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.8, color: "#444", marginBottom: 16 }}>
        AgentLoan uses the same mechanism as Aave: <strong>scaled balances</strong> with a cumulative index.
      </p>
      <div style={{ border: "3px solid #000", padding: "24px", marginBottom: 24, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2.2 }}>
        <div><strong>On deposit:</strong></div>
        <div style={{ paddingLeft: 24 }}>scaledBalance = depositAmount × RAY / liquidityIndex</div>
        <div style={{ marginTop: 8 }}><strong>Real balance (at any time):</strong></div>
        <div style={{ paddingLeft: 24 }}>realBalance = scaledBalance × currentLiquidityIndex / RAY</div>
        <div style={{ marginTop: 8 }}><strong>RAY = 1e27</strong></div>
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.8, color: "#444" }}>
        As borrowers pay interest, <code style={{ fontFamily: "var(--font-mono)", background: "#f5f5f5", padding: "2px 6px" }}>liquidityIndex</code> grows every block.
        Your balance grows automatically — you never need to claim rewards.
        When you withdraw, you receive the full real balance including all earned interest.
      </p>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>EXAMPLE</h2>
      <div style={{ border: "3px solid #000", padding: "24px", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2.2 }}>
        <div>Deposit 1,000 xUSDC when liquidityIndex = 1.0</div>
        <div>→ scaledBalance = 1,000</div>
        <div style={{ marginTop: 8 }}>After 1 year at 5% supply APY:</div>
        <div>liquidityIndex = 1.05</div>
        <div>realBalance = 1,000 × 1.05 = <strong>1,050 xUSDC</strong></div>
        <div>→ <strong>+50 xUSDC earned without any action</strong></div>
      </div>
    </DocPage>
  );
}
