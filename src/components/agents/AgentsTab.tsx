import { GuardianPanel }       from "./GuardianPanel";
import { YieldOptimizerPanel } from "./YieldOptimizerPanel";
import { BotStatusPanel }      from "./BotStatusPanel";
import { CoordinatorPanel }    from "./CoordinatorPanel";

export function AgentsTab() {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.7 }}>
        DeFi Agents monitor your positions and market conditions in real-time.
      </div>

      <CoordinatorPanel />
      <BotStatusPanel />
      <GuardianPanel />
      <YieldOptimizerPanel />
    </div>
  );
}
