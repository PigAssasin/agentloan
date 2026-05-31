"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Modal, OverviewRow } from "../shared/Modal";
import { TokenIcon }          from "../shared/TokenIcon";
import LendingPoolABI         from "@/lib/abi-lending-pool.json";
import MockERC20ABI           from "@/lib/abi-mock-erc20.json";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";
import { TOKENS, useUserAccountData, useUserTokenBalances, useWalletBalances, useReserveData } from "../../hooks/use-lending-pool";

const POOL = ARC_TESTNET_CONTRACTS.LENDING_POOL;

export function SupplyModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [step, setStep]     = useState<"idle" | "approving" | "depositing" | "done">("idle");

  const token        = Object.values(TOKENS).find(t => t.symbol === symbol);
  const decimals     = token?.decimals ?? 6;
  const tokenAddress = token?.address as `0x${string}` | undefined;

  // Refetch all data immediately after tx confirms
  const { refetch: refetchAccount }  = useUserAccountData();
  const { refetch: refetchBalances } = useUserTokenBalances();
  const { refetch: refetchWallet }   = useWalletBalances();
  const { refetch: refetchReserves } = useReserveData();
  function refetchAll() { refetchAccount(); refetchBalances(); refetchWallet(); refetchReserves(); }

  const { writeContract: runApprove, data: approveTxHash } = useWriteContract();
  const { writeContract: runDeposit, data: depositTxHash } = useWriteContract();

  const { isSuccess: approveSuccess, isLoading: approveWaiting } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: depositSuccess, isLoading: depositWaiting } = useWaitForTransactionReceipt({ hash: depositTxHash });

  // When approve confirmed → trigger deposit
  useEffect(() => {
    if (approveSuccess && tokenAddress && amount) {
      const parsed = parseUnits(amount, decimals);
      setStep("depositing");
      runDeposit({ address: POOL, abi: LendingPoolABI as any, functionName: "deposit", args: [tokenAddress, parsed] });
    }
  }, [approveSuccess]);

  // When deposit confirmed → done + immediate refetch
  useEffect(() => {
    if (depositSuccess) { setStep("done"); refetchAll(); }
  }, [depositSuccess]);

  const isPending = approveWaiting || depositWaiting;

  function handle() {
    const n = parseFloat(amount);
    if (!amount || !isFinite(n) || n <= 0 || !tokenAddress) return;
    const parsed = parseUnits(amount, decimals);
    setStep("approving");
    runApprove({ address: tokenAddress, abi: MockERC20ABI as any, functionName: "approve", args: [POOL, parsed] });
  }

  if (step === "done") return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ width: 56, height: 56, border: "4px solid #008000", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24, color: "#008000" }}>✓</div>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 8 }}>SUPPLIED</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999", marginBottom: 28 }}>{amount} {symbol} supplied successfully</p>
        <button style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 32px", border: "3px solid #000000", cursor: "pointer", background: "#fff", color: "#000" }} onClick={onClose}>CLOSE</button>
      </div>
    </Modal>
  );

  const stepLabel = step === "approving" ? "Step 1/2 — Approving token..." : step === "depositing" ? "Step 2/2 — Confirming deposit..." : "Step 1: Approve  →  Step 2: Supply";

  return (
    <Modal onClose={onClose} title={`Supply ${symbol}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <TokenIcon symbol={symbol} size={36} />
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{symbol}</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{token?.name}</div>
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 8 }}>Amount</div>
      <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "3px solid #000000" }}>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
          style={{ flex: 1, padding: "12px 16px", fontSize: 16, fontFamily: "var(--font-mono)", border: "none", outline: "none", background: "#ffffff", color: "#000000" }} />
        <button onClick={() => setAmount("10000")}
          style={{ padding: "0 20px", background: "#000000", color: "#ffffff", border: "none", borderLeft: "3px solid #000000", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>MAX</button>
      </div>

      <div style={{ marginBottom: 20, padding: "10px 14px", border: `2px solid ${step === "depositing" ? "#008000" : "#000000"}`, background: step === "depositing" ? "#f0fff0" : "#f5f5f5", fontFamily: "var(--font-body)", fontSize: 12, color: step === "depositing" ? "#008000" : "#333333" }}>
        {stepLabel}
      </div>

      <button onClick={handle} disabled={isPending || !amount || step !== "idle"}
        style={{ width: "100%", padding: "14px 0", background: isPending || !amount || step !== "idle" ? "#eeeeee" : "#000000", color: isPending || !amount || step !== "idle" ? "#999999" : "#ffffff", border: `3px solid ${isPending || !amount || step !== "idle" ? "#999999" : "#000000"}`, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: isPending || !amount || step !== "idle" ? "not-allowed" : "pointer" }}>
        {step === "approving" ? "APPROVING..." : step === "depositing" ? "DEPOSITING..." : `APPROVE & SUPPLY ${symbol}`}
      </button>
    </Modal>
  );
}
