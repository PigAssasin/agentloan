"use client";
import { useState, useEffect } from "react";
import { useAccount }          from "wagmi";
import { useReserveData }      from "@/hooks/use-lending-pool";

const STORAGE_KEY = "arcbank_yield_threshold";

export function YieldOptimizerPanel() {
  const { isConnected } = useAccount();
  // reserves is Record<"xUSDC"|"xEURC"|"xclrBTC", { supplyApy, borrowApy, ... }>
  const { reserves }    = useReserveData();

  const [threshold, setThreshold] = useState("3.0");
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) setThreshold(v);
  }, []);

  // Field is supplyApy (lowercase) — matches use-lending-pool.ts exactly
  const currentAPY    = reserves["xUSDC"]?.supplyApy ?? 0;
  const thresholdN    = parseFloat(threshold) || 3.0;
  const isOpportunity = currentAPY >= thresholdN;

  function save() {
    localStorage.setItem(STORAGE_KEY, threshold);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!isConnected) return null;

  return (
    <div style={{ border: "3px solid #000", padding: 24, background: isOpportunity ? "#f0fff4" : "#fff", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>YIELD OPTIMIZER</div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          background: isOpportunity ? "#34c759" : "#888",
          color: "#fff", padding: "3px 10px", borderRadius: 100,
        }}>
          {isOpportunity ? "OPPORTUNITY ✓" : "MONITORING"}
        </div>
      </div>

      {isOpportunity && (
        <div style={{ border: "2px solid #34c759", background: "#f0fff4", padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, color: "#1a7a36", marginBottom: 4 }}>
            APY EXCEEDS YOUR THRESHOLD
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#444" }}>
            xUSDC Supply APY: <strong>{currentAPY.toFixed(2)}%</strong>{" — "}
            Threshold: <strong>{thresholdN.toFixed(1)}%</strong>
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#444", marginTop: 4 }}>
            Deposit xUSDC now to start earning at this rate.
          </div>
        </div>
      )}

      {!isOpportunity && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#444", marginBottom: 16 }}>
          xUSDC Supply APY: <strong>{currentAPY.toFixed(2)}%</strong>
          {" "}— waiting for APY &gt; {thresholdN.toFixed(1)}%
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#444" }}>Notify when APY &gt;</span>
        <input
          type="number" min="0.5" max="100" step="0.5" value={threshold}
          onChange={e => setThreshold(e.target.value)}
          style={{ border: "2px solid #000", padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 14, width: 80, background: "#fff" }}
        />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>%</span>
        <button onClick={save} style={{
          border: "2px solid #000", background: saved ? "#34c759" : "#000",
          color: "#fff", padding: "6px 16px", fontFamily: "var(--font-heading)", fontSize: 12, cursor: "pointer",
        }}>
          {saved ? "SAVED ✓" : "SAVE"}
        </button>
      </div>

      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#888" }}>
        Monitors xUSDC supply APY. Deposit recommendation appears when APY exceeds threshold.
      </div>
    </div>
  );
}
