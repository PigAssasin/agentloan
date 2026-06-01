"use client";
import { useState, useEffect }               from "react";
import { useReadContracts, useWriteContract,
         useWaitForTransactionReceipt }       from "wagmi";
import { parseUnits }                         from "viem";
import { Modal, OverviewRow }                 from "../shared/Modal";
import LendingPoolABI from "@/lib/abi-lending-pool.json";
import MockERC20ABI   from "@/lib/abi-mock-erc20.json";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";

const POOL = ARC_TESTNET_CONTRACTS.LENDING_POOL;

// Tokens that can serve as collateral (never the debt token xUSDC)
const COLL_TOKENS = [
  { address: ARC_TESTNET_CONTRACTS.X_EURC,    symbol: "xEURC",   decimals: 6 },
  { address: ARC_TESTNET_CONTRACTS.X_CLR_BTC, symbol: "xclrBTC", decimals: 8 },
];

interface Props {
  borrower:       string;
  maxRepayUsdc:   string; // human-readable e.g. "12500.00"
  estimatedBonus: string; // USD string
  healthFactor:   string;
  onClose:        () => void;
  onSuccess:      () => void;
}

export function LiquidateModal({
  borrower, maxRepayUsdc, estimatedBonus, healthFactor, onClose, onSuccess,
}: Props) {
  const [step, setStep] = useState<"idle" | "approving" | "liquidating" | "done">("idle");

  const debtToken    = ARC_TESTNET_CONTRACTS.X_USDC as `0x${string}`;
  const repayAmount  = parseUnits(parseFloat(maxRepayUsdc).toFixed(6), 6);

  // Read borrower's supply balance for each collateral token to pick the best
  const { data: supplyData } = useReadContracts({
    contracts: COLL_TOKENS.map(t => ({
      address:      POOL,
      abi:          LendingPoolABI as any,
      functionName: "getUserSupplyBalance",
      args:         [t.address as `0x${string}`, borrower as `0x${string}`],
    })),
  });

  // Pick collateral = token with largest supply balance
  const collToken = (() => {
    if (!supplyData) return ARC_TESTNET_CONTRACTS.X_CLR_BTC as `0x${string}`;
    let best    = ARC_TESTNET_CONTRACTS.X_CLR_BTC as `0x${string}`;
    let bestBal = 0n;
    supplyData.forEach((r, i) => {
      const bal = (r.result as bigint) ?? 0n;
      if (bal > bestBal) { bestBal = bal; best = COLL_TOKENS[i].address as `0x${string}`; }
    });
    return best;
  })();

  const collSymbol = COLL_TOKENS.find(t => t.address === collToken)?.symbol ?? "xclrBTC";

  // approve → liquidate chain (same pattern as SupplyModal)
  const { writeContract: runApprove,   data: approveTxHash }   = useWriteContract();
  const { writeContract: runLiquidate, data: liquidateTxHash } = useWriteContract();

  const { isSuccess: approveSuccess,   isLoading: approveWaiting }   =
    useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: liquidateSuccess, isLoading: liquidateWaiting } =
    useWaitForTransactionReceipt({ hash: liquidateTxHash });

  // When approve confirms → trigger liquidation
  useEffect(() => {
    if (approveSuccess) {
      setStep("liquidating");
      runLiquidate({
        address:      POOL,
        abi:          LendingPoolABI as any,
        functionName: "liquidate",
        args:         [borrower as `0x${string}`, debtToken, collToken, repayAmount],
      });
    }
  }, [approveSuccess]);

  useEffect(() => {
    if (liquidateSuccess) { setStep("done"); onSuccess(); }
  }, [liquidateSuccess]);

  const isPending = approveWaiting || liquidateWaiting;

  function handle() {
    if (isPending || step !== "idle") return;
    setStep("approving");
    runApprove({
      address:      debtToken,
      abi:          MockERC20ABI as any,
      functionName: "approve",
      args:         [POOL, repayAmount],
    });
  }

  if (step === "done") return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ width: 56, height: 56, border: "4px solid #008000", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24, color: "#008000" }}>
          ✓
        </div>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 8 }}>LIQUIDATED</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999", marginBottom: 28 }}>
          You repaid {parseFloat(maxRepayUsdc).toLocaleString("en-US", { maximumFractionDigits: 2 })} xUSDC
          and received {collSymbol} collateral + 5% bonus.
        </p>
        <button
          onClick={onClose}
          style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", padding: "10px 32px", border: "3px solid #000", cursor: "pointer", background: "#fff", color: "#000" }}
        >
          CLOSE
        </button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title="Liquidate Position">
      {/* Borrower address */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#888", marginBottom: 4 }}>BORROWER</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, marginBottom: 20, wordBreak: "break-all" }}>
        {borrower.slice(0, 10)}...{borrower.slice(-6)}
      </div>

      {/* HF warning */}
      <div style={{ border: "2px solid #ff3b30", background: "#fff0ef", padding: "12px 16px", marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#ff3b30", fontWeight: 600 }}>
          ⚠ Health Factor: {healthFactor} — Below 1.0 (liquidatable)
        </div>
      </div>

      {/* Overview */}
      <div style={{ borderTop: "2px solid #000", paddingTop: 16, marginBottom: 20 }}>
        <OverviewRow label="You repay"   value={`${parseFloat(maxRepayUsdc).toLocaleString("en-US", { maximumFractionDigits: 2 })} xUSDC`} />
        <OverviewRow label="You receive" value={`${collSymbol} + 5% bonus`} accent />
        <OverviewRow label="Est. bonus"  value={`~$${parseFloat(estimatedBonus).toLocaleString("en-US", { maximumFractionDigits: 2 })}`} />
        <OverviewRow label="Collateral"  value={collSymbol} />
      </div>

      {/* Step indicator */}
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#888", marginBottom: 20 }}>
        Step 1: Approve {parseFloat(maxRepayUsdc).toFixed(2)} xUSDC → Step 2: Liquidate
      </div>

      {/* Action button */}
      <button
        onClick={handle}
        disabled={isPending}
        style={{
          width: "100%", padding: "14px 0",
          background: isPending ? "#eeeeee" : "#ff3b30",
          color:      isPending ? "#999999" : "#ffffff",
          border:     `3px solid ${isPending ? "#999" : "#ff3b30"}`,
          fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.08em",
          cursor: isPending ? "not-allowed" : "pointer",
        }}
      >
        {step === "approving"   ? "APPROVING..." :
         step === "liquidating" ? "LIQUIDATING..." :
         "LIQUIDATE — EARN 5% BONUS"}
      </button>
    </Modal>
  );
}
