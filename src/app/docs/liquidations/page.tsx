import { DocPage, InfoBox, WarnBox, Table } from "../_components/DocPage";

export default function LiquidationsPage() {
  return (
    <DocPage
      title="Liquidations"
      description="When a borrower's Health Factor falls below 1.0, anyone can liquidate their position to earn a bonus."
      prev={{ label: "APY & Interest", href: "/docs/apy" }}
      next={{ label: "DeFi Agents", href: "/docs/agents" }}
    >
      <InfoBox title="Open Liquidations">
        AgentLoan uses open liquidations — any wallet can liquidate any undercollateralized position.
        Liquidators are incentivized by a <strong>liquidation bonus</strong> on the collateral they receive.
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>HOW IT WORKS</h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.8, color: "#444", marginBottom: 24 }}>
        When Health Factor &lt; 1.0, a liquidator can repay up to <strong>50% of the borrower's debt</strong> (close factor)
        and receive collateral in return at a discount.
      </p>
      <div style={{ border: "3px solid #000", padding: "24px", background: "#f9f9f9", marginBottom: 24, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2.2 }}>
        <div>Collateral seized = debtRepaid × liquidationBonus / collateralPrice</div>
        <div style={{ marginTop: 8 }}>Example (xclrBTC bonus = 5%):</div>
        <div style={{ paddingLeft: 24 }}>Repay $1,000 xUSDC debt</div>
        <div style={{ paddingLeft: 24 }}>Receive $1,050 worth of xclrBTC</div>
        <div style={{ paddingLeft: 24 }}>→ <strong>$50 profit for the liquidator</strong></div>
      </div>

      <Table
        headers={["Asset", "Liquidation Threshold", "Liquidation Bonus"]}
        rows={[
          ["xUSDC", "85%", "+5%"],
          ["xEURC", "85%", "+5%"],
          ["xclrBTC", "75%", "+5%"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>HOW TO AVOID LIQUIDATION</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
        {[
          { action: "Repay debt", effect: "Reduces denominator of HF formula" },
          { action: "Add more collateral", effect: "Increases numerator of HF formula" },
          { action: "Set HF target > 1.5", effect: "Buffer against price moves" },
          { action: "Monitor regularly", effect: "Especially in volatile markets" },
        ].map(({ action, effect }) => (
          <div key={action} style={{ border: "3px solid #000", padding: "16px 20px" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, marginBottom: 6 }}>{action.toUpperCase()}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666" }}>{effect}</div>
          </div>
        ))}
      </div>

      <WarnBox>
        <strong>⚠ AgentLoan uses mock oracle prices</strong> on testnet (BTC = $60,000 fixed).
        On mainnet with real Pyth Network feeds, collateral prices fluctuate and liquidation risk is real.
        Always maintain a safe Health Factor buffer.
      </WarnBox>
    </DocPage>
  );
}
