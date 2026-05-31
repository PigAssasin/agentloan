"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Modal, OverviewRow } from "../shared/Modal";
import { TokenIcon }          from "../shared/TokenIcon";
import LendingPoolABI         from "@/lib/abi-lending-pool.json";
import MockERC20ABI           from "@/lib/abi-mock-erc20.json";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";
import { TOKENS }             from "../../hooks/use-lending-pool";

const POOL = ARC_TESTNET_CONTRACTS.LENDING_POOL;

export function SupplyModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [step, setStep]     = useState<"approve" | "deposit" | "done">("approve");

  const token        = Object.values(TOKENS).find(t => t.symbol === symbol);
  const decimals     = token?.decimals ?? 6;
  const tokenAddress = token?.address as `0x${string}` | undefined;

  const { writeContract: runApprove, data: approveTxHash } = useWriteContract();
  const { writeContract: runDeposit, data: depositTxHash } = useWriteContract();

  const { isLoading: approveWaiting } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    query: {
      enabled: !!approveTxHash,
      onSuccess: () => {
        if (!tokenAddress) return;
        const parsed = parseUnits(amount, decimals);
        setStep("deposit");
        runDeposit({ address: POOL, abi: LendingPoolABI as any, functionName: "deposit", args: [tokenAddress, parsed] });
      },
    } as any,
  });

  const { isLoading: depositWaiting } = useWaitForTransactionReceipt({
    hash: depositTxHash,
    query: {
      enabled: !!depositTxHash,
      onSuccess: () => setStep("done"),
    } as any,
  });

  const isPending = approveWaiting || depositWaiting;

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
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 8 }}>SUPPLIED</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999", marginBottom: 28 }}>
          {amount} {symbol} supplied successfully
        </p>
        <button style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 32px", border: "3px solid #000000", cursor: "pointer", background: "#fff", color: "#000" }} onClick={onClose}>
          CLOSE
        </button>
      </div>
    </Modal>
  );

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
      <div style={{ display: "flex", gap: 0, marginBottom: 6, border: "3px solid #000000" }}>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
          style={{ flex: 1, padding: "12px 16px", fontSize: 16, fontFamily: "var(--font-mono)", border: "none", outline: "none", background: "#ffffff", color: "#000000" }} />
        <button onClick={() => setAmount("10000")}
          style={{ padding: "0 20px", background: "#000000", color: "#ffffff", border: "none", borderLeft: "3px solid #000000", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>
          MAX
        </button>
      </div>

      {step === "deposit" && (
        <div style={{ marginBottom: 16, padding: "10px 14px", border: "2px solid #008000", fontFamily: "var(--font-body)", fontSize: 12, color: "#008000" }}>
          Approval confirmed. Confirm deposit in wallet...
        </div>
      )}

      <div style={{ borderTop: "2px solid #000000", paddingTop: 16, marginBottom: 24 }}>
        <OverviewRow label="Step" value={step === "approve" ? "1. Approve token  2. Supply" : "Confirming deposit..."} />
      </div>

      <button onClick={handle} disabled={isPending || !amount || step !== "approve"}
        style={{
          width: "100%", padding: "14px 0",
          background: isPending || !amount ? "#eeeeee" : "#000000",
          color: isPending || !amount ? "#999999" : "#ffffff",
          border: `3px solid ${isPending || !amount ? "#999999" : "#000000"}`,
          fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.08em",
          cursor: isPending || !amount ? "not-allowed" : "pointer",
        }}>
        {isPending ? "CONFIRMING..." : `APPROVE & SUPPLY ${symbol}`}
      </button>
    </Modal>
  );
}
