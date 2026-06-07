import { BotStatusPanel }      from "./BotStatusPanel";
import { CoordinatorPanel }    from "./CoordinatorPanel";
import { PersonalAgentPanel }  from "./PersonalAgentPanel";

export function AgentsTab() {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.7 }}>
        Autonomous agents running 24/7 on Arc Testnet.
      </div>

      <PersonalAgentPanel />
      <CoordinatorPanel />
      <BotStatusPanel />
    </div>
  );
}
