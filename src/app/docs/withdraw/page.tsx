import { DocPage, Step, WarnBox } from "../_components/DocPage";

export default function WithdrawPage() {
  return (
    <DocPage
      title="Withdraw"
      description="Withdraw your supplied assets and any earned interest back to your wallet."
      prev={{ label: "How to Repay", href: "/docs/repay" }}
      next={{ label: "Health Factor", href: "/docs/health-factor" }}
    >
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 24 }}>STEPS</h2>

      <Step n={1} title="Go to Your Supplies">
        On the Dashboard under <strong>Your Supplies</strong>, find the asset you want to withdraw.
        The balance shown is your real balance including any earned interest.
      </Step>
      <Step n={2} title="Click Withdraw">
        Click the <strong>WITHDRAW</strong> button. The modal shows your full supplied balance including accrued interest.
      </Step>
      <Step n={3} title="Enter Amount">
        Enter the amount to withdraw or click <strong>MAX</strong> to withdraw everything.
        You will receive your principal plus all interest earned since deposit.
      </Step>
      <Step n={4} title="Confirm Transaction">
        Withdraw is a single transaction — one MetaMask confirmation.
      </Step>

      <WarnBox>
        <strong>⚠ If you have an active loan,</strong> withdrawing collateral may push your Health Factor below 1.0
        and trigger liquidation. The contract will revert the transaction if withdrawal would leave you undercollateralized.
        Repay your debt first before withdrawing all collateral.
      </WarnBox>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginTop: 16 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>POOL LIQUIDITY</div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7, color: "#444", margin: 0 }}>
          You can only withdraw what is currently liquid in the pool (total supplied minus total borrowed).
          If utilization is very high, you may need to wait for borrowers to repay before withdrawing.
          This is rare under normal conditions.
        </p>
      </div>
    </DocPage>
  );
}
