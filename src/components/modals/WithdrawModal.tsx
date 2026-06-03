"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Modal, OverviewRow } from "../shared/Modal";
import { TokenIcon }          from "../shared/TokenIcon";
import LendingPoolABI         from "@/lib/abi-lending-pool.json";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";
import { TOKENS, useUserTokenBalances, useUserAccountData } from "../../hooks/use-lending-pool";

const POOL = ARC_TESTNET_CONTRACTS.LENDING_POOL;

export function WithdrawModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [done, setDone]     = useState(false);

  const token        = Object.values(TOKENS).find(t => t.symbol === symbol);
  const decimals     = token?.decimals ?? 6;
  const tokenAddress = token?.address as `0x${string}` | undefined;
  const { supply, refetch } = useUserTokenBalances();
  const supplied = supply[symbol as keyof typeof supply] ?? 0;

  // Safe max withdraw — keep HF ≥ 1.05 after withdrawal
  const { healthFactorRaw, totalDebtUSD } = useUserAccountData();
  const hf = healthFactorRaw === (2n ** 256n - 1n) ? Infinity : Number(healthFactorRaw) / 1e18;
  const safeMaxAmount = totalDebtUSD === 0
    ? supplied                                        // no debt → withdraw all
    : supplied * Math.max(0, 1 - 1.05 / hf);         // keep HF ≥ 1.05
  const maxAmount = Math.min(supplied, safeMaxAmount);

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isPending } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash, onSuccess: () => { setDone(true); refetch(); } } as any,
  });

  function handle() {
    const n = parseFloat(amount);
    if (!amount || !isFinite(n) || n <= 0 || n > supplied || !tokenAddress) return;
    writeContract({ address: POOL, abi: LendingPoolABI as any, functionName: "withdraw", args: [tokenAddress, parseUnits(amount, decimals)] });
  }

  if (done) return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ width: 56, height: 56, border: "4px solid #008000", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24, color: "#008000" }}>✓</div>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 8 }}>WITHDRAWN</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999", marginBottom: 28 }}>{amount} {symbol} sent to your wallet</p>
        <button style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 32px", border: "3px solid #000000", cursor: "pointer", background: "#fff", color: "#000" }} onClick={onClose}>CLOSE</button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title={`Withdraw ${symbol}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <TokenIcon symbol={symbol} size={36} />
        <div><div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{symbol}</div></div>
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 8 }}>Amount</div>
      <div style={{ display: "flex", gap: 0, marginBottom: 6, border: "3px solid #000000" }}>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
          style={{ flex: 1, padding: "12px 16px", fontSize: 16, fontFamily: "var(--font-mono)", border: "none", outline: "none", background: "#ffffff", color: "#000000" }} />
        <button onClick={() => setAmount(maxAmount.toFixed(decimals === 8 ? 8 : 6))}
          style={{ padding: "0 20px", background: "#000000", color: "#ffffff", border: "none", borderLeft: "3px solid #000000", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>MAX</button>
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999", marginBottom: 4 }}>
        Supplied: {supplied.toFixed(decimals === 8 ? 6 : 2)} {symbol}
      </p>
      {totalDebtUSD > 0 && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#ff8c00", marginBottom: 24 }}>
          Max safe withdraw: {maxAmount.toFixed(decimals === 8 ? 6 : 2)} {symbol} (keeps HF ≥ 1.05)
        </p>
      )}
      <div style={{ borderTop: "2px solid #000000", paddingTop: 16, marginBottom: 24 }}>
        <OverviewRow label="Remaining collateral" value={`${(maxAmount - parseFloat(amount || "0")).toFixed(2)} ${symbol}`} />
      </div>
      <button onClick={handle} disabled={isPending || !amount}
        style={{ width: "100%", padding: "14px 0", background: isPending || !amount ? "#eeeeee" : "#000000", color: isPending || !amount ? "#999999" : "#ffffff", border: `3px solid ${isPending || !amount ? "#999999" : "#000000"}`, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: isPending || !amount ? "not-allowed" : "pointer" }}>
        {isPending ? "CONFIRMING..." : `WITHDRAW ${symbol}`}
      </button>
    </Modal>
  );
}
