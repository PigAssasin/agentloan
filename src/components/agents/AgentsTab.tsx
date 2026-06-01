import { GuardianPanel }       from "./GuardianPanel";
import { YieldOptimizerPanel } from "./YieldOptimizerPanel";

export function AgentsTab() {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.7 }}>
        DeFi Agents monitor your positions and market conditions in real-time.
        Configure thresholds — agents alert you when action is needed.
      </div>

      <GuardianPanel />
      <YieldOptimizerPanel />

      <div style={{ border: "2px solid #e0e0e0", padding: "16px 20px", background: "#fafafa" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 13, marginBottom: 8 }}>LIQUIDATION BOT</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#666", lineHeight: 1.7 }}>
          Autonomous bot monitors all positions every ~15s and liquidates undercollateralized
          positions (HF &lt; 1.0), earning a 5% bonus. Registered on Arc ERC-8004 identity registry.
          Running 24/7 via PM2 on a dedicated VPS.
        </div>
      </div>
    </div>
  );
}
