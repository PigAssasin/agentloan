"use client";
import { useState, useEffect, useCallback } from "react";
import { useAccount }                        from "wagmi";
import { LiquidateModal }                    from "../modals/LiquidateModal";

interface Position {
  borrower:       string;
  healthFactor:   string;
  totalDebtUSD:   string;
  maxRepayUsdc:   string;
  estimatedBonus: string;
  collateralUSD:  string;
  debtToken:      string;
  debtSymbol:     string;
}

function hfColor(hf: string): string {
  const n = parseFloat(hf);
  if (n < 1.0) return "#ff3b30";
  if (n < 1.2) return "#ff9500";
  return "#34c759";
}

function fmtUSD(val: string, decimals = 0): string {
  const n = parseFloat(val);
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function JobsTab() {
  const { isConnected } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<Position | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res  = await fetch("/api/liquidation-jobs");
      const data = await res.json();
      setPositions(data.positions ?? []);
      setLastFetch(new Date());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 15_000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  // Elapsed seconds since last fetch
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetch) setElapsed(Math.floor((Date.now() - lastFetch.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastFetch]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, marginBottom: 6 }}>
            LIQUIDATION OPPORTUNITIES
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666", lineHeight: 1.7, maxWidth: 560 }}>
            Repay debt for undercollateralized positions and earn a 5% collateral bonus.
            The bonus comes from the borrower&apos;s collateral — the protocol pays nothing.
            First to act earns the bonus.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#34c759", animation: "pulse 2s infinite" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#666" }}>
            {lastFetch ? `${elapsed}s ago` : "Loading..."}
          </span>
        </div>
      </div>

      {/* Not connected */}
      {!isConnected && (
        <div style={{ border: "3px solid #000", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, marginBottom: 8 }}>CONNECT WALLET</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666" }}>
            Connect your wallet to see and execute liquidation opportunities.
          </div>
        </div>
      )}

      {/* Loading */}
      {isConnected && loading && (
        <div style={{ border: "3px solid #000", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#666" }}>
            Scanning positions...
          </div>
        </div>
      )}

      {/* Healthy */}
      {isConnected && !loading && positions.length === 0 && (
        <div style={{ border: "3px solid #000", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 12 }}>
            PROTOCOL IS HEALTHY ✅
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666" }}>
            No positions are currently liquidatable. Refreshes every 15 seconds.
          </div>
        </div>
      )}

      {/* Positions table */}
      {isConnected && !loading && positions.length > 0 && (
        <>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#888", marginBottom: 12 }}>
            {positions.length} liquidatable position{positions.length > 1 ? "s" : ""} — sorted by urgency
          </div>

          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
            gap: 0, padding: "10px 16px", background: "#000",
          }}>
            {["BORROWER", "HEALTH FACTOR", "TOTAL DEBT", "EST. BONUS", "ACTION"].map(h => (
              <span key={h} style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#fff" }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {positions.map((pos, i) => (
            <div
              key={pos.borrower}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                gap: 0, padding: "16px", alignItems: "center",
                border: "3px solid #000",
                borderTop: i === 0 ? "3px solid #000" : "1px solid #e0e0e0",
                background: i % 2 === 0 ? "#fff" : "#fafafa",
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {pos.borrower.slice(0, 10)}...{pos.borrower.slice(-6)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: hfColor(pos.healthFactor) }}>
                {pos.healthFactor}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                {fmtUSD(pos.totalDebtUSD)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#34c759", fontWeight: 700 }}>
                +{fmtUSD(pos.estimatedBonus, 0)}
              </div>
              <button
                onClick={() => setSelected(pos)}
                style={{
                  background: "#ff3b30", color: "#fff",
                  border: "2px solid #ff3b30", padding: "8px 16px",
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
                  textTransform: "uppercase", cursor: "pointer",
                  letterSpacing: "0.06em",
                }}
              >
                LIQUIDATE
              </button>
            </div>
          ))}
        </>
      )}

      {/* How it works */}
      <div style={{ border: "2px solid #e0e0e0", padding: "16px 20px", marginTop: 24, background: "#fafafa" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, marginBottom: 8 }}>HOW IT WORKS</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#666", lineHeight: 1.8 }}>
          1. You repay up to 50% of the borrower&apos;s xUSDC debt (requires xUSDC in your wallet).<br />
          2. You instantly receive their collateral worth debt + 5% bonus.<br />
          3. Bonus = from borrower&apos;s collateral, not from the protocol or treasury.<br />
          4. The Liquidation Bot runs 24/7 and competes for the same opportunities.
        </div>
      </div>

      {/* Modal */}
      {selected && (
        <LiquidateModal
          borrower={selected.borrower}
          maxRepayUsdc={selected.maxRepayUsdc}
          estimatedBonus={selected.estimatedBonus}
          healthFactor={selected.healthFactor}
          onClose={() => setSelected(null)}
          onSuccess={() => { setSelected(null); fetchJobs(); }}
        />
      )}
    </div>
  );
}
