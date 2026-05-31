"use client";

const MAX_HF = 2n ** 256n - 1n;
const WAD    = 10n ** 18n;

function hfColor(hf: bigint): string {
  // 0n = insolvent / no data — show as danger, not safe
  if (hf === 0n)                   return "#FF0000";
  if (hf === MAX_HF)               return "#008000";
  if (hf >= (15n * WAD) / 10n)    return "#008000";
  if (hf >= WAD)                   return "#FFA500";
  return "#FF0000";
}

function hfFormat(hf: bigint): string {
  if (hf === MAX_HF) return "∞";
  if (hf === 0n)     return "0.00";
  const v = Number(hf) / 1e18;
  return v > 99 ? "∞" : v.toFixed(2);
}

function hfLabel(hf: bigint): string {
  if (hf === 0n)                   return "LIQUIDATABLE";
  if (hf === MAX_HF)               return "SAFE";
  if (hf >= (15n * WAD) / 10n)    return "SAFE";
  if (hf >= WAD)                   return "AT RISK";
  return "LIQUIDATABLE";
}

export function HealthFactorBanner({ healthFactor }: { healthFactor: bigint }) {
  // Never hide the banner — 0 means insolvent, must show danger
  const color = hfColor(healthFactor);
  const label = hfLabel(healthFactor);
  const value = hfFormat(healthFactor);
  const pct   = healthFactor === MAX_HF
    ? 100
    : healthFactor === 0n
      ? 0
      : Math.min((Number(healthFactor) / 3e18) * 100, 100);

  return (
    <div style={{
      border: `3px solid ${color}`,
      padding: "16px 24px", marginBottom: 16,
      background: healthFactor === 0n ? "#fff5f5" : "#ffffff",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#999999" }}>
          Health Factor
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
  );
}
