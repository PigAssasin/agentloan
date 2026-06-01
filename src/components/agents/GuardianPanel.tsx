"use client";
import { useState, useEffect } from "react";
import { useAccount }          from "wagmi";
import { useUserAccountData }  from "@/hooks/use-lending-pool";

const MAX_HF      = 2n ** 256n - 1n;
const STORAGE_KEY = "arcbank_guardian_threshold";

function fmtHF(hf: bigint): string {
  if (hf === MAX_HF) return "∞";
  return (Number(hf) / 1e18).toFixed(2);
}

export function GuardianPanel() {
  const { isConnected } = useAccount();
  const { healthFactorRaw, totalDebtUSD, totalWeightedCollateralUSD } = useUserAccountData();

  const [threshold, setThreshold] = useState("1.5");
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) setThreshold(v);
  }, []);

  const thresholdN = parseFloat(threshold) || 1.5;
  const hfFloat    = healthFactorRaw === MAX_HF ? Infinity : Number(healthFactorRaw) / 1e18;
  const hasDebt    = totalDebtUSD > 0;
  const isAlert    = hasDebt && hfFloat < thresholdN;

  // Repay amount to restore HF to (threshold + 0.2)
  const suggestedRepay = (() => {
    if (!isAlert) return 0;
    const target = thresholdN + 0.2;
    return Math.max(0, totalDebtUSD - totalWeightedCollateralUSD / target);
  })();

  function save() {
    localStorage.setItem(STORAGE_KEY, threshold);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!isConnected) return null;

  return (
    <div style={{ border: "3px solid #000", padding: 24, background: isAlert ? "#fff8e1" : "#fff", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>GUARDIAN AGENT</div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          background: !hasDebt ? "#888" : isAlert ? "#ff3b30" : "#34c759",
          color: "#fff", padding: "3px 10px", borderRadius: 100,
        }}>
          {!hasDebt ? "NO POSITION" : isAlert ? "⚠ ALERT" : "WATCHING"}
        </div>
      </div>

      {isAlert && (
        <div style={{ border: "2px solid #ff3b30", background: "#fff0ef", padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, color: "#ff3b30", marginBottom: 4 }}>
            HF BELOW YOUR THRESHOLD
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#444" }}>
            Current HF: <strong>{fmtHF(healthFactorRaw)}</strong> — Threshold: <strong>{thresholdN.toFixed(2)}</strong>
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#444", marginTop: 4 }}>
            Suggested repay: <strong>${suggestedRepay.toLocaleString("en-US", { maximumFractionDigits: 0 })}</strong> xUSDC
            {" "}to reach HF {(thresholdN + 0.2).toFixed(1)}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#444" }}>Alert when HF &lt;</span>
        <input
          type="number" min="1.1" max="5.0" step="0.1" value={threshold}
          onChange={e => setThreshold(e.target.value)}
          style={{ border: "2px solid #000", padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 14, width: 80, background: "#fff" }}
        />
        <button onClick={save} style={{
          border: "2px solid #000", background: saved ? "#34c759" : "#000",
          color: "#fff", padding: "6px 16px", fontFamily: "var(--font-heading)", fontSize: 12, cursor: "pointer",
        }}>
          {saved ? "SAVED ✓" : "SAVE"}
        </button>
      </div>

      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#888" }}>
        Monitors your Health Factor. Alert appears when HF drops below threshold.
        Use the Repay action in your dashboard to restore your position.
      </div>
    </div>
  );
}
