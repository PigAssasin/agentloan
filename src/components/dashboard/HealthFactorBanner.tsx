"use client";

import { useRealtimeHF } from "../../hooks/use-realtime-hf";

const MAX_HF = 2n ** 256n - 1n;
const WAD    = 10n ** 18n;

function hfColor(hf: bigint): string {
  if (hf === 0n)                return "#FF0000";
  if (hf === MAX_HF)            return "#008000";
  if (hf >= (15n * WAD) / 10n) return "#008000";
  if (hf >= WAD)                return "#FFA500";
  return "#FF0000";
}

function hfFormat(hf: bigint): string {
  if (hf === MAX_HF) return "∞";
  if (hf === 0n)     return "0.00";
  const v = Number(hf) / 1e18;
  return v > 99 ? "∞" : v.toFixed(2);
}

function hfLabel(hf: bigint): string {
  if (hf === 0n)                return "LIQUIDATABLE";
  if (hf === MAX_HF)            return "SAFE";
  if (hf >= (15n * WAD) / 10n) return "SAFE";
  if (hf >= WAD)                return "AT RISK";
  return "LIQUIDATABLE";
}


export function HealthFactorBanner({ healthFactor, hfString }: { healthFactor: bigint; hfString: string }) {
  const color = hfColor(healthFactor);
  const label = hfLabel(healthFactor);
  const value = hfFormat(healthFactor);
  const pct   = healthFactor === MAX_HF ? 100
    : healthFactor === 0n ? 0
    : Math.min((Number(healthFactor) / 3e18) * 100, 100);

  const rt = useRealtimeHF(hfString);
  const showWarning = rt.hasSignificantDeviation && healthFactor !== MAX_HF && healthFactor !== 0n;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Price deviation warning */}
      {showWarning && (
        <div style={{
          border: "3px solid #FF0000", padding: "10px 20px", marginBottom: 8,
          background: "#fff5f5", display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "#FF0000", color: "#fff", padding: "2px 8px", flexShrink: 0 }}>
            ⚠ PRICE LAG
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#333", lineHeight: 1.5 }}>
            On-chain oracle price differs from real-time by{" "}
            {rt.priceDeviation.xclrBTC !== null && (
              <strong>BTC {rt.priceDeviation.xclrBTC.toFixed(1)}%</strong>
            )}
            {rt.priceDeviation.xEURC !== null && rt.priceDeviation.xclrBTC !== null && " · "}
            {rt.priceDeviation.xEURC !== null && (
              <strong>EUR {rt.priceDeviation.xEURC.toFixed(1)}%</strong>
            )}
            {" "}— your actual Health Factor may differ. Oracle updates every 5 min.
          </span>
        </div>
      )}

      {/* Main HF banner */}
      <div style={{
        border: `3px solid ${color}`, padding: "16px 24px",
        background: healthFactor === 0n ? "#fff5f5" : "#ffffff",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999" }}>
            Health Factor
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color, border: `2px solid ${color}`, padding: "2px 8px" }}>
              {label}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color }}>
              {value}
            </span>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}
