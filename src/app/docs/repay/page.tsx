import { DocPage, Step, InfoBox } from "../_components/DocPage";

export default function RepayPage() {
  return (
    <DocPage
      title="How to Repay"
      description="Repay your borrowed xUSDC to reduce your debt, lower your Borrow APY cost, and improve your Health Factor."
      prev={{ label: "How to Borrow", href: "/docs/borrow" }}
      next={{ label: "Health Factor", href: "/docs/health-factor" }}
    >
      <InfoBox>
        Your debt grows over time as interest accrues. The amount shown in the Repay modal reflects your
        current real debt including all accrued interest — not just the original borrowed amount.
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 24 }}>STEPS</h2>

      <Step n={1} title="Go to Your Borrows">
        On the Dashboard under <strong>Your Borrows</strong>, find your xUSDC debt position.
        The debt amount shown includes all accrued interest.
      </Step>
      <Step n={2} title="Click Repay">
        Click the <strong>REPAY</strong> button next to xUSDC.
      </Step>
      <Step n={3} title="Enter Amount">
        Enter the amount to repay or click <strong>MAX</strong> to repay your full outstanding debt.
        Partial repayments are allowed — you can repay any amount up to your full debt.
      </Step>
      <Step n={4} title="Approve + Repay (2 transactions)">
        Like supply, repaying requires two wallet confirmations:
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
          <li><strong>Step 1 — Approve:</strong> Grants the pool permission to pull your xUSDC</li>
          <li><strong>Step 2 — Repay:</strong> Transfers xUSDC to clear your debt</li>
        </ul>
      </Step>
      <Step n={5} title="Check Health Factor">
        After repaying, your Health Factor will increase. If you fully repay, HF returns to ∞.
      </Step>

      <div style={{ background: "#f5f5f5", border: "3px solid #000", padding: "20px 24px", marginTop: 32 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>NOTE ON INTEREST</div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7, color: "#444", margin: 0 }}>
          Interest accrues every block. By the time your repay transaction confirms, your debt may be
          slightly higher than when you opened the modal. The contract automatically caps your repayment
          to your actual outstanding debt — you will never overpay.
        </p>
      </div>
    </DocPage>
  );
}
