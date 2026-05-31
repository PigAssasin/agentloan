"use client";

import { useState } from "react";
import { Modal, OverviewRow } from "../shared/Modal";
import { TokenIcon } from "../shared/TokenIcon";

export function WithdrawModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [amount, setAmount]   = useState("");
  const [isPending, setPending] = useState(false);
  const [isDone, setDone]     = useState(false);
  const MAX_SUPPLIED = symbol === "cirBTC" ? "0.0500" : symbol === "EURC" ? "1000.00" : "5000.00";

  async function handle() {
    const n = parseFloat(amount);
    if (!amount || !isFinite(n) || n <= 0 || n > parseFloat(MAX_SUPPLIED)) return;
    setPending(true);
    await new Promise(r => setTimeout(r, 1500));
    setPending(false); setDone(true);
  }

  if (isDone) return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ width: 56, height: 56, border: "4px solid #008000", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24, color: "#008000" }}>✓</div>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 8 }}>WITHDRAWN</h3>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#999999", marginBottom: 28 }}>
          {amount} {symbol} sent to your wallet
        </p>
        <button style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 32px", border: "3px solid #000000", cursor: "pointer", background: "#fff", color: "#000" }} onClick={onClose}>
          CLOSE
        </button>
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title={`Withdraw ${symbol}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <TokenIcon symbol={symbol} size={36} />
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600 }}>{symbol}</div>
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999", marginBottom: 8 }}>
        Amount
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 6, border: "3px solid #000000" }}>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          style={{
            flex: 1, padding: "12px 16px", fontSize: 16, fontFamily: "var(--font-mono)",
            border: "none", outline: "none", background: "#ffffff", color: "#000000",
          }}
        />
        <button
          onClick={() => setAmount(MAX_SUPPLIED)}
          style={{
            padding: "0 20px", background: "#000000", color: "#ffffff",
            border: "none", borderLeft: "3px solid #000000",
            fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
          }}
        >
          MAX
        </button>
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#999999", marginBottom: 24 }}>
        Supplied: {MAX_SUPPLIED} {symbol}
      </p>

      <div style={{ borderTop: "2px solid #000000", paddingTop: 16, marginBottom: 24 }}>
        <OverviewRow label="Health factor"        value="4.80 → 2.10" />
        <OverviewRow label="Remaining collateral" value="$0.00" />
      </div>

      <button
        onClick={handle}
        disabled={isPending || !amount}
        style={{
          width: "100%", padding: "14px 0",
          background: isPending || !amount ? "#eeeeee" : "#000000",
          color: isPending || !amount ? "#999999" : "#ffffff",
          border: `3px solid ${isPending || !amount ? "#999999" : "#000000"}`,
          fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.08em",
          cursor: isPending || !amount ? "not-allowed" : "pointer",
        }}
      >
        {isPending ? "CONFIRMING..." : `WITHDRAW ${symbol}`}
      </button>
    </Modal>
  );
}
