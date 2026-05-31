import { DocPage, Step, InfoBox, Table } from "../_components/DocPage";

export default function SupplyPage() {
  return (
    <DocPage
      title="How to Supply"
      description="Supply assets to ArcBank to earn variable APY and use them as collateral to borrow."
      prev={{ label: "Getting Started", href: "/docs/getting-started" }}
      next={{ label: "How to Borrow", href: "/docs/borrow" }}
    >
      <InfoBox title="What is Supplying?">
        When you supply assets, they go into the shared lending pool. Borrowers pay interest on what they borrow,
        and that interest flows back to suppliers proportionally. Your balance grows automatically — no claiming needed.
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 24 }}>STEPS</h2>

      <Step n={1} title="Go to Dashboard">
        Navigate to the <strong>Dashboard</strong>. Under <strong>Assets to Supply</strong>, you will see all available tokens and your wallet balance for each.
      </Step>
      <Step n={2} title="Click Supply">
        Click the <strong>SUPPLY</strong> button next to the token you want to deposit.
      </Step>
      <Step n={3} title="Enter Amount">
        Type the amount or click <strong>MAX</strong> to supply your full wallet balance.
        The modal shows your wallet balance so you know the maximum available.
      </Step>
      <Step n={4} title="Approve + Deposit (2 transactions)">
        Supplying requires two wallet confirmations:
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
          <li><strong>Step 1 — Approve:</strong> Grants the pool permission to spend your tokens</li>
          <li><strong>Step 2 — Deposit:</strong> Transfers your tokens into the pool</li>
        </ul>
        The modal shows which step is in progress. Do not close the modal between confirmations.
      </Step>
      <Step n={5} title="Done">
        Your supplied balance appears in <strong>Your Supplies</strong> panel with the current APY.
        Interest starts accruing immediately from the next block.
      </Step>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 24, marginTop: 40 }}>SUPPORTED ASSETS</h2>

      <Table
        headers={["Asset", "Decimals", "Max LTV", "Liq. Threshold", "Earns APY"]}
        rows={[
          ["xUSDC", "6", "80%", "85%", "✅ Yes"],
          ["xEURC", "6", "80%", "85%", "✅ Yes"],
          ["xclrBTC", "8", "70%", "75%", "✅ Yes"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>HOW INTEREST ACCRUES</h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.8, color: "#444", marginBottom: 16 }}>
        ArcBank uses Aave-style scaled balances. When you deposit, your amount is divided by the current{" "}
        <code style={{ fontFamily: "var(--font-mono)", background: "#f5f5f5", padding: "2px 6px" }}>liquidityIndex</code>.
        As borrowers pay interest, the index grows. Your real balance = <code style={{ fontFamily: "var(--font-mono)", background: "#f5f5f5", padding: "2px 6px" }}>scaledBalance × currentIndex</code>.
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.8, color: "#444" }}>
        This means your balance grows every block proportional to borrower demand — no manual claiming required.
      </p>
    </DocPage>
  );
}
