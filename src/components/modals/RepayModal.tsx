"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Modal, OverviewRow } from "../shared/Modal";
import { TokenIcon }          from "../shared/TokenIcon";
import LendingPoolABI         from "@/lib/abi-lending-pool.json";
import MockERC20ABI           from "@/lib/abi-mock-erc20.json";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";
import { TOKENS, useUserTokenBalances } from "../../hooks/use-lending-pool";

const POOL = ARC_TESTNET_CONTRACTS.LENDING_POOL;

export function RepayModal({ token: tokenSymbol, onClose }: { token: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [step, setStep]     = useState<"approve" | "repay" | "done">("approve");

  const token        = Object.values(TOKENS).find(t => t.symbol === tokenSymbol);
  const decimals     = token?.decimals ?? 6;
  const tokenAddress = token?.address as `0x${string}` | undefined;
  const { borrow, refetch } = useUserTokenBalances();
  const maxDebt = borrow[tokenSymbol as keyof typeof borrow] ?? 0;

  const { writeContract: runApprove, data: approveTxHash } = useWriteContract();
  const { writeContract: runRepay,   data: repayTxHash   } = useWriteContract();

  const { isLoading: approveWaiting } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    query: {
      enabled: !!approveTxHash,
      onSuccess: () => {
        if (!tokenAddress) return;
        const parsed = parseUnits(amount, decimals);
        setStep("repay");
        runRepay({ address: POOL, abi: LendingPoolABI as any, functionName: "repay", args: [tokenAddress, parsed] });
      },
    } as any,
  });

  const { isLoading: repayWaiting } = useWaitForTransactionReceipt({
    hash: repayTxHash,
    query: { enabled: !!repayTxHash, onSuccess: () => { setStep("done"); refetch(); } } as any,
  });

  const isPending = approveWaiting || repayWaiting;

  function handle() {
    const n = parseFloat(amount);
    if (!amount || !isFinite(n) || n <= 0 || !tokenAddress) return;
    const parsed = parseUnits(amount, decimals);
    runApprove({ address: tokenAddress, abi: MockERC20ABI as any, functionName: "approve", args: [POOL, parsed] });
  }

  if (step === "done") return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ width: 56, height: 56, border: "4px solid #008000", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24, color: "#008000" }}>✓</div>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 8 }}>REPAID</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999", marginBottom: 28 }}>{amount} {tokenSymbol} repaid successfully</p>
        <button style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 32px", border: "3px solid #000000", cursor: "pointer", background: "#fff", color: "#000" }} onClick={onClose}>CLOSE</button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title={`Repay ${tokenSymbol}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <TokenIcon symbol={tokenSymbol} size={36} />
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{tokenSymbol}</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#999999" }}>{token?.name}</div>
        </div>
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 8 }}>Amount</div>
      <div style={{ display: "flex", gap: 0, marginBottom: 6, border: "3px solid #000000" }}>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
          style={{ flex: 1, padding: "12px 16px", fontSize: 16, fontFamily: "var(--font-mono)", border: "none", outline: "none", background: "#ffffff", color: "#000000" }} />
        <button onClick={() => setAmount(maxDebt.toFixed(decimals === 8 ? 8 : 6))}
          style={{ padding: "0 20px", background: "#000000", color: "#ffffff", border: "none", borderLeft: "3px solid #000000", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>MAX</button>
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999", marginBottom: 24 }}>
        Outstanding debt: {maxDebt.toFixed(2)} {tokenSymbol}
      </p>

      {step === "repay" && (
        <div style={{ marginBottom: 16, padding: "10px 14px", border: "2px solid #008000", fontFamily: "var(--font-body)", fontSize: 12, color: "#008000" }}>
          Approval confirmed. Confirm repay in wallet...
        </div>
      )}

      <div style={{ borderTop: "2px solid #000000", paddingTop: 16, marginBottom: 24 }}>
        <OverviewRow label="Remaining debt" value={`${Math.max(0, maxDebt - parseFloat(amount || "0")).toFixed(2)} ${tokenSymbol}`} accent />
      </div>
      <button onClick={handle} disabled={isPending || !amount || step !== "approve"}
        style={{ width: "100%", padding: "14px 0", background: isPending || !amount ? "#eeeeee" : "#000000", color: isPending || !amount ? "#999999" : "#ffffff", border: `3px solid ${isPending || !amount ? "#999999" : "#000000"}`, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: isPending || !amount ? "not-allowed" : "pointer" }}>
        {isPending ? "CONFIRMING..." : `APPROVE & REPAY ${tokenSymbol}`}
      </button>
    </Modal>
  );
}
