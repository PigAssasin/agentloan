import { DocPage, InfoBox, WarnBox, Table } from "../_components/DocPage";

export default function AgentsPage() {
  return (
    <DocPage
      title="DeFi Agents"
      description="AgentLoan runs four autonomous agents — a Personal Agent for your positions, an AI Coordinator, a Liquidation Bot, and a Signal Agent."
      prev={{ label: "Liquidations", href: "/docs/liquidations" }}
      next={{ label: "Smart Contracts", href: "/docs/contracts" }}
    >
      <InfoBox title="Agent Architecture">
        AgentLoan agents run 24/7 on dedicated infrastructure.
        <strong> Personal Agent</strong> manages your individual position.
        <strong> Protocol Manager</strong> (Coordinator + Oracle Keeper) keeps the system healthy.
        <strong> Liquidation Bot</strong> executes liquidations and earns rewards.
        <strong> Signal Agent</strong> sells early warnings via the x402 payment protocol.
      </InfoBox>

      {/* ── Personal Agent ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 8 }}>
        01 — PERSONAL AGENT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        Your autonomous DeFi autopilot. Set up once — agent monitors your Health Factor 24/7,
        automatically repays debt when HF drops below your target, and deploys idle xUSDC to earn yield.
        Uses <strong>Gemini AI</strong> with rolling memory to make context-aware decisions.
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>HOW IT WORKS</div>
        <div>Every 10s: read your Health Factor (Multicall3, $0)</div>
        <div style={{ paddingLeft: 24 }}>├─ HF &lt; 1.05 → emergency repay immediately (no LLM)</div>
        <div style={{ paddingLeft: 24 }}>├─ HF &lt; target → call Gemini with memory context → repay</div>
        <div style={{ paddingLeft: 24 }}>├─ HF safe + idle xUSDC in wallet → deploy to yield</div>
        <div style={{ paddingLeft: 24 }}>└─ After action → save to memory → notify via Telegram</div>
        <div style={{ marginTop: 8 }}>LLM cooldown: 5 minutes per user (prevents over-calling)</div>
        <div>Memory: rolling 50 entries → LLM learns your position patterns</div>
      </div>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["AI model", "Gemini 2.5 Flash (default) — user can set own key"],
          ["Trigger (emergency)", "HF < 1.05 — acts immediately, skips LLM"],
          ["Trigger (normal)", "HF < target — calls LLM with memory context"],
          ["Cooldown", "5 minutes between LLM calls per user"],
          ["Yield deployment", "Deploys idle wallet xUSDC when HF > target + 0.3"],
          ["Execution", "AgentExecutor contract — atomic withdrawFor + repayFor"],
          ["Arc ERC-8004 ID", "#67459"],
          ["Setup", "Dashboard → AGENTS tab → approve + authorize + activate"],
        ]}
      />

      <InfoBox title="Bring your own LLM">
        By default the agent uses the protocol&apos;s Gemini key (shared). Open the AI Reasoning section
        in the AGENTS tab to add your own Gemini, OpenAI, or DeepSeek API key for dedicated capacity.
      </InfoBox>

      {/* ── Coordinator Agent ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        02 — COORDINATOR AGENT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        The brain of the liquidation system. Runs every 30 seconds and uses <strong>Gemini AI</strong> to reason about
        liquidation strategy. Considers profit, urgency, and market conditions to produce a priority-ordered
        liquidation queue. Learns from past outcomes via persistent memory.
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>TWO-TIER DECISION SYSTEM</div>
        <div style={{ paddingLeft: 24, color: "#666" }}>Tier 1 — Scoring function (always, $0)</div>
        <div style={{ paddingLeft: 24 }}>├─ Score = profit × 0.4 + urgency(HF) × 0.6</div>
        <div style={{ paddingLeft: 24 }}>└─ Ranks ALL positions instantly</div>
        <div style={{ paddingLeft: 24, color: "#666", marginTop: 8 }}>Tier 2 — Gemini AI (only on real events)</div>
        <div style={{ paddingLeft: 24 }}>├─ BTC/collateral price change &gt; 1.5%</div>
        <div style={{ paddingLeft: 24 }}>├─ New position crosses HF 1.05 or 1.02</div>
        <div style={{ paddingLeft: 24 }}>└─ 5-minute minimum between AI calls</div>
      </div>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["AI model", "Gemini 2.5 Flash (primary) + DeepSeek V3 (fallback)"],
          ["Cost at scale", "~$0.01–0.02/day regardless of user count"],
          ["Agent wallet", "0x4dcE343E9c35112AAF9Ddce566689C3f36C73482"],
          ["Arc ERC-8004 ID", "#34625"],
        ]}
      />

      {/* ── Liquidation Bot ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        03 — LIQUIDATION BOT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        Executes the Coordinator&apos;s strategy. Monitors every borrower position every block (~0.48s) and
        liquidates positions with HF&nbsp;&lt;&nbsp;1.0, earning a 5% collateral bonus.
      </p>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["Reaction time", "~15 seconds (oracle staleness threshold)"],
          ["Collateral bonus", "5% of debt value"],
          ["Bot wallet", "0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a"],
          ["Arc ERC-8004 ID", "#30907"],
        ]}
      />

      <WarnBox>
        <strong>Testnet only.</strong> Anyone can run their own liquidation bot — see{" "}
        <a href="https://github.com/PigAssasin/agentloan" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>
          github.com/PigAssasin/agentloan
        </a>.
      </WarnBox>

      {/* ── Signal Agent ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        04 — SIGNAL AGENT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        Sells early liquidation warnings to bots via <strong>x402 payment protocol</strong>.
        Scans all positions every 5 seconds for HF&nbsp;&lt;&nbsp;1.1.
        Bots pay 1 xUSDC for 1,000 signals (24h session) and get a 15–30 second head start.
      </p>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["Price", "1 xUSDC per session (1,000 signals / 24h)"],
          ["Scan interval", "5 seconds"],
          ["Agent wallet", "0x555cc39B822392E45A0B69776d6AeEadfcC5af3D"],
          ["Arc ERC-8004 ID", "#31772"],
        ]}
      />

      {/* ── Comparison ─────────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 16, marginTop: 40 }}>
        AGENT COMPARISON
      </h2>

      <Table
        headers={["Agent", "For", "Runs", "Trigger"]}
        rows={[
          ["Personal Agent", "Your position", "VPS (every block)", "HF < your target"],
          ["Coordinator", "Protocol efficiency", "VPS (every 30s)", "Positions HF < 1.1"],
          ["Liquidation Bot", "Protocol + bot operator", "VPS (every block)", "HF < 1.0"],
          ["Signal Agent", "Bot subscribers", "VPS (every 5s)", "Positions HF < 1.1"],
        ]}
      />

      <div style={{ border: "3px solid #000", padding: "24px", background: "#fff", marginTop: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, marginBottom: 12 }}>LIVE STATUS</div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", margin: 0, lineHeight: 1.7 }}>
          Check live agent status in <strong>Dashboard → AGENTS</strong> tab.
          Personal Agent setup: approve xUSDC → authorize → activate.
        </p>
      </div>
    </DocPage>
  );
}
