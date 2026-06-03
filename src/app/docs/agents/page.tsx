import { DocPage, InfoBox, WarnBox, Table, Code, Step } from "../_components/DocPage";

export default function AgentsPage() {
  return (
    <DocPage
      title="DeFi Agents"
      description="AgentLoan runs five autonomous agents — an AI coordinator, a liquidation bot, a signal marketplace, and two browser agents — working together 24 hours a day."
      prev={{ label: "Liquidations", href: "/docs/liquidations" }}
      next={{ label: "Smart Contracts", href: "/docs/contracts" }}
    >
      <InfoBox title="What are DeFi Agents?">
        AgentLoan's agent layer has two tiers. <strong>Server agents</strong> (Coordinator, Liquidation Bot, Signal Agent)
        run 24/7 on dedicated infrastructure. <strong>Browser agents</strong> (Guardian, Yield Optimizer) run in your
        browser and alert you when action is needed.
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
        <div style={{ fontWeight: 700, marginBottom: 8 }}>HOW IT WORKS</div>
        <div>Every 30s: read pool state from Liquidation Bot</div>
        <div style={{ paddingLeft: 24 }}>├─ No positions HF &lt; 1.1 → skip (no AI call, no cost)</div>
        <div style={{ paddingLeft: 24 }}>├─ Risky positions found → call Gemini with pool state + history</div>
        <div style={{ paddingLeft: 24 }}>├─ Gemini returns priority list + reasoning</div>
        <div style={{ paddingLeft: 24 }}>├─ Save decision to coordinator.json (read by Liquidation Bot)</div>
        <div style={{ paddingLeft: 24 }}>└─ Record outcome after execution → memory improves over time</div>
      </div>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["AI model", "Gemini 2.0 Flash (primary) + DeepSeek V3 (fallback)"],
          ["Trigger", "Only when positions HF < 1.1 exist"],
          ["Interval", "30 seconds"],
          ["Memory", "Rolling 20 decisions + auto-summary"],
          ["Agent wallet", "0x4dcE343E9c35112AAF9Ddce566689C3f36C73482"],
          ["Arc ERC-8004 ID", "#34625"],
          ["Infrastructure", "PM2 on VPS alongside Liquidation Bot"],
        ]}
      />

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
          ["Bot wallet (Circle SCA)", "0x69efc5abdc9f9f1e90f59261c0fdf601e53291af"],
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

      {/* ── Guardian Agent ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        04 — GUARDIAN AGENT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        A browser-based agent that monitors your personal Health Factor and alerts you
        before you get liquidated. Set your own threshold — when HF drops below it,
        a banner appears with the exact amount you need to repay to restore safety.
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, background: "#f9f9f9", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>EXAMPLE</div>
        <div>You set threshold: 1.5</div>
        <div>BTC price drops → your HF falls to 1.28</div>
        <div style={{ color: "#ff3b30" }}>⚠ ALERT: HF below your threshold</div>
        <div>Suggested repay: $3,200 xUSDC → restores HF to 1.7</div>
      </div>

      <Step n={1} title="Go to Dashboard → AGENTS tab">
        Connect your wallet and open the AGENTS tab in the dashboard.
      </Step>
      <Step n={2} title="Set your HF threshold">
        Enter a Health Factor threshold (e.g. 1.5). The alert fires when your HF drops below this.
      </Step>
      <Step n={3} title="Save — Guardian is now watching">
        Threshold is saved locally. The Guardian checks your HF on every page load and every ~3 seconds.
      </Step>
      <Step n={4} title="When an alert fires — repay immediately">
        The alert shows the exact xUSDC amount needed. Click Repay in the POSITIONS tab.
      </Step>

      <InfoBox title="How is the repay amount calculated?">
        Target HF = your threshold + 0.2 buffer.<br />
        Max safe debt = weighted collateral ÷ target HF.<br />
        Suggested repay = current debt − max safe debt.
      </InfoBox>

      {/* ── Yield Optimizer ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        05 — YIELD OPTIMIZER
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        Monitors the xUSDC supply APY and notifies you when the rate exceeds your target.
        When APY crosses your threshold, a deposit recommendation appears.
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, background: "#f9f9f9", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>EXAMPLE</div>
        <div>You set threshold: 5%</div>
        <div>Protocol utilization rises → APY reaches 6.2%</div>
        <div style={{ color: "#34c759" }}>✓ OPPORTUNITY: APY exceeds your threshold</div>
        <div>Deposit xUSDC now to earn 6.2% APY</div>
      </div>

      <InfoBox>
        APY is variable — it changes with pool utilization. The Yield Optimizer updates every 4 seconds.
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
          ["Guardian Agent", "You (borrower)", "Your browser", "Your HF < threshold"],
          ["Yield Optimizer", "You (lender)", "Your browser", "APY > threshold"],
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
