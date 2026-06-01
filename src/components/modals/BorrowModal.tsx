"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Modal, OverviewRow } from "../shared/Modal";
import { TokenIcon }          from "../shared/TokenIcon";
import LendingPoolABI         from "@/lib/abi-lending-pool.json";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";
import { TOKENS, useUserAccountData, useUserTokenBalances, useReserveData } from "../../hooks/use-lending-pool";

const POOL = ARC_TESTNET_CONTRACTS.LENDING_POOL;

export function BorrowModal({ token: tokenSymbol, onClose }: { token: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [done, setDone]     = useState(false);

  const token        = Object.values(TOKENS).find(t => t.symbol === tokenSymbol);
  const decimals     = token?.decimals ?? 6;
  const tokenAddress = token?.address as `0x${string}` | undefined;
  const { availableBorrows, refetch: refetchAccount } = useUserAccountData();
  const { refetch: refetchBalances } = useUserTokenBalances();
  const { reserves, refetch: refetchReserves } = useReserveData();
  const r = reserves[tokenSymbol as keyof typeof reserves];

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isPending, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash } as any,
  });

  useEffect(() => {
    if (isSuccess) { setDone(true); refetchAccount(); refetchBalances(); refetchReserves(); }
  }, [isSuccess]);

  function handle() {
    const n = parseFloat(amount);
    if (!amount || !isFinite(n) || n <= 0 || !tokenAddress) return;
    const priceUSD  = r?.priceUSD ?? 1;
    const amountUSD = n * priceUSD;
    if (availableBorrows <= 0) {
      alert("Supply collateral first before borrowing.");
      return;
    }
    if (amountUSD > availableBorrows) {
      alert(`Max borrow is $${availableBorrows.toFixed(2)}. Reduce your amount.`);
      return;
    }
    writeContract({ address: POOL, abi: LendingPoolABI as any, functionName: "borrow", args: [tokenAddress, parseUnits(amount, decimals)] });
  }

  if (done) return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ width: 56, height: 56, border: "4px solid #008000", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24, color: "#008000" }}>✓</div>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 8 }}>BORROWED</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999", marginBottom: 28 }}>{amount} {tokenSymbol} sent to your wallet</p>
        <button style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 32px", border: "3px solid #000000", cursor: "pointer", background: "#fff", color: "#000" }} onClick={onClose}>CLOSE</button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title={`Borrow ${tokenSymbol}`}>
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
        <button onClick={() => setAmount(availableBorrows.toFixed(2))}
          style={{ padding: "0 20px", background: "#000000", color: "#ffffff", border: "none", borderLeft: "3px solid #000000", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>MAX</button>
      </div>
      {token?.borrowable && tokenSymbol === "xUSDC" && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#FFA500", marginBottom: 8, padding: "6px 10px", border: "1px solid #FFA500" }}>
          ⚠ Borrowing an asset you also supply creates recursive leverage risk. Use with caution.
        </p>
      )}
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999", marginBottom: 24 }}>
        Available: ${availableBorrows.toFixed(2)} · APY: {r ? `${r.borrowApy.toFixed(2)}%` : "—"}
      </p>
      <div style={{ borderTop: "2px solid #000000", paddingTop: 16, marginBottom: 24 }}>
        <OverviewRow label="Borrow APY" value={r ? `${r.borrowApy.toFixed(2)}%` : "—"} accent />
      </div>
      <button onClick={handle} disabled={isPending || !amount}
        style={{ width: "100%", padding: "14px 0", background: isPending || !amount ? "#eeeeee" : "#000000", color: isPending || !amount ? "#999999" : "#ffffff", border: `3px solid ${isPending || !amount ? "#999999" : "#000000"}`, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: isPending || !amount ? "not-allowed" : "pointer" }}>
        {isPending ? "CONFIRMING..." : `BORROW ${tokenSymbol}`}
      </button>
    </Modal>
  );
}
