import { DocPage, Step, InfoBox, WarnBox, Table } from "../_components/DocPage";

export default function BorrowPage() {
  return (
    <DocPage
      title="How to Borrow"
      description="Borrow xUSDC against your supplied collateral. Your borrowing limit is determined by your collateral value and LTV ratio."
      prev={{ label: "How to Supply", href: "/docs/supply" }}
      next={{ label: "How to Repay", href: "/docs/repay" }}
    >
      <InfoBox title="Before You Borrow">
        You must supply collateral first. Only <strong>xUSDC</strong> can be borrowed.
        Your maximum borrow amount is calculated as: <code style={{ fontFamily: "var(--font-mono)", background: "#f5f5f5", padding: "2px 6px" }}>collateral_value × LTV</code>.
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 24 }}>STEPS</h2>

      <Step n={1} title="Supply Collateral First">
        If you haven't already, supply xclrBTC or xEURC as collateral.
        This unlocks your borrowing capacity.
      </Step>
      <Step n={2} title="Check Available Borrows">
        On the Dashboard under <strong>Assets to Borrow</strong>, you will see <strong>Available</strong> — the maximum USD value you can currently borrow.
      </Step>
      <Step n={3} title="Click Borrow">
        Click the <strong>BORROW</strong> button next to xUSDC.
      </Step>
      <Step n={4} title="Enter Amount">
        Enter the amount you want to borrow. The modal shows your available capacity and current Borrow APY.
        Press <strong>MAX</strong> to borrow up to your limit (use with caution — this puts you close to liquidation).
      </Step>
      <Step n={5} title="Confirm Transaction">
        Borrow is a single transaction — one wallet confirmation in MetaMask.
        xUSDC will be sent to your wallet immediately.
      </Step>

      <WarnBox>
        <strong>⚠ Keep your Health Factor above 1.5</strong> to avoid liquidation risk.
        Borrowing close to your maximum LTV leaves little room if your collateral price drops.
        A Health Factor of 2.0+ is recommended for safety.
      </WarnBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 24, marginTop: 40 }}>LTV BY COLLATERAL</h2>

      <Table
        headers={["Collateral", "Max LTV", "Example: $1,000 collateral → max borrow"]}
        rows={[
          ["xclrBTC", "70%", "$700 xUSDC"],
          ["xEURC", "80%", "$800 xUSDC"],
          ["xUSDC", "80%", "$800 xUSDC"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>BORROW APY</h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.8, color: "#444" }}>
        The borrow rate is variable and changes with pool utilization. When more people borrow relative to supply, the rate increases.
        Your accrued debt grows every block — check the dashboard regularly to monitor your Health Factor.
      </p>

      <Table
        headers={["Utilization", "Borrow APY", "Supply APY"]}
        rows={[
          ["0%", "5.0%", "0.0%"],
          ["40%", "7.0%", "2.8%"],
          ["80% (kink)", "9.0%", "7.2%"],
          ["90%", "81.5%", "73.4%"],
          ["100%", "154%", "154%"],
        ]}
      />
    </DocPage>
  );
}
