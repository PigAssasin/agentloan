import { DocPage, InfoBox, WarnBox, Table, Code, Step } from "../_components/DocPage";

export default function AgentsPage() {
  return (
    <DocPage
      title="DeFi Agents"
      description="AgentLoan runs three autonomous agents — an AI coordinator, a liquidation bot, and a signal marketplace — working together 24 hours a day on Arc Testnet."
      prev={{ label: "Liquidations", href: "/docs/liquidations" }}
      next={{ label: "Smart Contracts", href: "/docs/contracts" }}
    >
      <InfoBox title="What are DeFi Agents?">
        AgentLoan's agent layer runs 24/7 on dedicated infrastructure.
        The <strong>Protocol Manager</strong> (Coordinator + Oracle Keeper) keeps the system healthy.
        The <strong>Liquidation Bot</strong> executes liquidations and earns rewards.
        The <strong>Signal Agent</strong> sells early warnings via the x402 payment protocol.
      </InfoBox>

      {/* ── Coordinator Agent ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 8 }}>
        01 — COORDINATOR AGENT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        The brain of the system. Runs every 30 seconds and uses <strong>Gemini AI</strong> to reason about
        liquidation strategy — only when risky positions exist (HF&nbsp;&lt;&nbsp;1.1).
        Considers profit, urgency, front-run risk, and market conditions to produce a priority-ordered
        liquidation queue. Learns from past outcomes via a persistent memory system.
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>TWO-TIER DECISION SYSTEM</div>
        <div>Every 30s: read all positions from bot shared state</div>
        <div style={{ paddingLeft: 24, color: "#666" }}>Tier 1 — Scoring function (always, $0, scales to 1000+)</div>
        <div style={{ paddingLeft: 24 }}>├─ Score = profit × 0.4 + urgency(HF) × 0.6</div>
        <div style={{ paddingLeft: 24 }}>└─ Ranks ALL positions instantly, writes to coordinator.json</div>
        <div style={{ paddingLeft: 24, color: "#666", marginTop: 8 }}>Tier 2 — Gemini AI (only on real events)</div>
        <div style={{ paddingLeft: 24 }}>├─ Trigger A: BTC/collateral price change &gt; 1.5%</div>
        <div style={{ paddingLeft: 24 }}>├─ Trigger B: New position crosses HF 1.05 or 1.02 threshold</div>
        <div style={{ paddingLeft: 24 }}>├─ Minimum 5 minutes between AI calls</div>
        <div style={{ paddingLeft: 24 }}>├─ AI reasons about top 10 most urgent only</div>
        <div style={{ paddingLeft: 24 }}>└─ AI priority (top 10) + scoring order (everyone else) = final list</div>
      </div>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["AI model", "Gemini 2.5 Flash (primary) + DeepSeek V3 (fallback)"],
          ["Normal trigger", "Scoring function — instant, $0, unlimited scale"],
          ["AI trigger", "Price change >1.5% or new critical threshold crossed"],
          ["AI scope", "Top 10 most urgent positions only"],
          ["Min AI interval", "5 minutes"],
          ["Memory", "Rolling 20 decisions + auto-summary"],
          ["Agent wallet", "0x4dcE343E9c35112AAF9Ddce566689C3f36C73482"],
          ["Arc ERC-8004 ID", "#34625"],
          ["Infrastructure", "PM2 on VPS alongside Liquidation Bot"],
        ]}
      />

      <InfoBox title="Cost at scale">
        With 100+ users: scoring function handles all decisions for free. Gemini is only called
        when the market moves (&gt;1.5% price change) or a position enters critical zone — roughly
        10–20 times per day regardless of user count. Cost: ~$0.01–0.02/day.
      </InfoBox>

      {/* ── Liquidation Bot ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        02 — LIQUIDATION BOT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        Executes the Coordinator's strategy. Monitors every borrower position every block (~0.48s) and
        liquidates positions with HF&nbsp;&lt;&nbsp;1.0, earning a 5% collateral bonus.
        Registered on-chain as an AI agent via <strong>Arc ERC-8004</strong> (Agent ID #30907).
        Uses Circle Developer-Controlled Wallets for gasless execution.
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>HOW IT WORKS</div>
        <div>watchBlocks (~0.48s per block)</div>
        <div style={{ paddingLeft: 24, color: "#666" }}>└─ isRunning guard — skips if previous iteration still running</div>
        <div style={{ paddingLeft: 24 }}>├─ Every 20 blocks: scan Borrow events (incremental)</div>
        <div style={{ paddingLeft: 24 }}>├─ Oracle stale &gt; 15s → push fresh Pyth prices on-chain</div>
        <div style={{ paddingLeft: 24 }}>├─ Multicall3: read HF for ALL borrowers in 1 RPC call</div>
        <div style={{ paddingLeft: 24 }}>├─ Sort by Coordinator priority (falls back to rule-based if stale)</div>
        <div style={{ paddingLeft: 24 }}>└─ HF &lt; 1.0 → approve → liquidate → earn 5% bonus</div>
      </div>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["Reaction time", "~15 seconds (oracle staleness threshold)"],
          ["Collateral bonus", "5% of debt value"],
          ["Max repay per tx", "50% of borrower's debt (close factor)"],
          ["Bot wallet (Circle SCA)", "0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a"],
          ["Arc ERC-8004 ID", "#30907"],
          ["Infrastructure", "PM2 on VPS — auto-restarts on crash"],
        ]}
      />

      <WarnBox>
        <strong>Testnet only.</strong> The bot wallet holds xUSDC as liquidation capital.
        Anyone can run their own liquidation bot — see the <a href="https://github.com/PigAssasin/agentloan" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>GitHub README</a> for setup instructions.
      </WarnBox>

      {/* ── Signal Agent ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        03 — SIGNAL AGENT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        A marketplace for early warning signals. Scans all borrower positions every 5 seconds for
        HF&nbsp;&lt;&nbsp;1.1 and sells these warnings to liquidation bots via the{" "}
        <strong>x402 payment protocol</strong>. Bots pay 1 xUSDC for 1,000 signals (24h session)
        and get a 15-30 second head start on liquidations.
        Registered on-chain as an AI agent via <strong>Arc ERC-8004</strong> (Agent ID #31772).
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>X402 PAYMENT FLOW</div>
        <div>Bot: GET /v1/signals → 402 Payment Required</div>
        <div style={{ paddingLeft: 24 }}>└─ Response: {"{ price: '1 xUSDC', payTo: '0x...' }"}</div>
        <div>Bot: transfer 1 xUSDC on-chain</div>
        <div>Bot: GET /v1/signals + X-Payment-Tx: 0x...</div>
        <div style={{ paddingLeft: 24 }}>└─ Response: {"{ signals: [...], sessionId, remaining: 1000 }"}</div>
        <div>Bot: reuse session for up to 1,000 requests / 24h</div>
      </div>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["Price", "1 xUSDC per session"],
          ["Signals per session", "1,000 (24 hours)"],
          ["Scan interval", "5 seconds"],
          ["HF threshold", "< 1.1 (early warning)"],
          ["Agent wallet", "0x555cc39B822392E45A0B69776d6AeEadfcC5af3D"],
          ["Arc ERC-8004 ID", "#31772"],
        ]}
      />

      <InfoBox>
        Anyone can run their own Signal Agent and earn xUSDC from bot subscriptions.
        See <a href="https://github.com/PigAssasin/agentloan/tree/main/signal-agent" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>signal-agent/README.md</a> for setup instructions.
      </InfoBox>

      {/* ── Comparison ─────────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 16, marginTop: 40 }}>
        AGENT COMPARISON
      </h2>

      <Table
        headers={["Agent", "Who benefits", "Runs where", "Trigger"]}
        rows={[
          ["Coordinator", "Protocol efficiency", "VPS (every 30s)", "Positions HF < 1.1"],
          ["Liquidation Bot", "Protocol + bot operator", "VPS (every block)", "HF < 1.0"],
          ["Signal Agent", "Signal Agent operator", "VPS (every 5s)", "Positions HF < 1.1"],
        ]}
      />

      <div style={{ border: "3px solid #000", padding: "24px", background: "#fff", marginTop: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, marginBottom: 12 }}>LIVE AGENT STATUS</div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", margin: 0, lineHeight: 1.7 }}>
          Check real-time bot status, Signal Agent stats, and active liquidation jobs in the{" "}
          <strong>Dashboard → AGENTS / SIGNAL / JOBS</strong> tabs.
        </p>
      </div>
    </DocPage>
  );
}
