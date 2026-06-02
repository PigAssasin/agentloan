import { DocPage, InfoBox, WarnBox, Table, Code, Step } from "../_components/DocPage";

export default function AgentsPage() {
  return (
    <DocPage
      title="DeFi Agents"
      description="AgentLoan runs three autonomous agents that monitor positions, protect users, and keep the protocol healthy — 24 hours a day."
      prev={{ label: "Liquidations", href: "/docs/liquidations" }}
      next={{ label: "Smart Contracts", href: "/docs/contracts" }}
    >
      <InfoBox title="What are DeFi Agents?">
        DeFi Agents are autonomous programs that interact with the AgentLoan protocol on your behalf.
        The <strong>Liquidation Bot</strong> runs on a dedicated server and monitors every position in real-time.
        The <strong>Guardian Agent</strong> and <strong>Yield Optimizer</strong> run in your browser and alert you when action is needed.
      </InfoBox>

      {/* ── Liquidation Bot ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 8 }}>
        01 — LIQUIDATION BOT
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        A fully autonomous bot that monitors every borrower position every ~15 seconds and liquidates
        undercollateralized positions (HF&nbsp;&lt;&nbsp;1.0), earning a 5% collateral bonus.
        Registered on-chain as an AI agent via the{" "}
        <strong>Arc ERC-8004</strong> identity registry (Agent ID #30907).
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>HOW IT WORKS</div>
        <div>watchBlocks (~0.48s per block)</div>
        <div style={{ paddingLeft: 24, color: "#666" }}>└─ isRunning guard — skips if previous iteration still running</div>
        <div style={{ paddingLeft: 24 }}>├─ Every 20 blocks: scan Borrow events (incremental, saves progress)</div>
        <div style={{ paddingLeft: 24 }}>├─ Oracle stale &gt; 15s → push fresh Pyth prices on-chain</div>
        <div style={{ paddingLeft: 24 }}>├─ Multicall3: read HF for ALL borrowers in 1 RPC call</div>
        <div style={{ paddingLeft: 24 }}>└─ HF &lt; 1.0 → approve → liquidate → earn 5% bonus</div>
      </div>

      <Table
        headers={["Property", "Value"]}
        rows={[
          ["Reaction time", "~15 seconds (oracle staleness threshold)"],
          ["Collateral bonus", "5% of debt value"],
          ["Max repay per tx", "50% of borrower's debt (close factor)"],
          ["Bot wallet", "0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a"],
          ["Arc ERC-8004 ID", "#30907"],
          ["Infrastructure", "PM2 on VPS — auto-restarts on crash"],
          ["Auto-refill", "Transfers 100 USDC from deployer when gas < 10 USDC"],
        ]}
      />

      <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 12, marginTop: 8 }}>ERROR HANDLING</h3>
      <Table
        headers={["Error", "What happens"]}
        rows={[
          ["Oracle update fails / timeout 10s", "Skip, try again next block"],
          ["Position already liquidated by someone else", "Tx reverts, bot catches error, continues"],
          ["Bot wallet out of gas", "Oracle updates skip — auto-refill triggers"],
          ["Bot crashes", "PM2 restarts it within 5 seconds, resumes from saved block"],
          ["VPS reboots", "PM2 startup configured — bot restarts automatically"],
        ]}
      />

      <WarnBox>
        <strong>Testnet only.</strong> The Liquidation Bot uses testnet tokens with no real-world value.
        The bot wallet holds xUSDC as liquidation capital — earned profits accumulate there.
      </WarnBox>

      {/* ── Guardian Agent ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        02 — GUARDIAN AGENT
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
        A higher threshold gives you more warning time before liquidation.
      </Step>
      <Step n={3} title="Save — Guardian is now watching">
        Your threshold is saved in localStorage. The Guardian checks your HF on every page load
        and whenever new data arrives from the chain (~every 3 seconds).
      </Step>
      <Step n={4} title="When an alert fires — repay immediately">
        The alert shows the exact xUSDC amount to repay to restore HF above your target.
        Click Repay in the POSITIONS tab to execute.
      </Step>

      <InfoBox title="How is the repay amount calculated?">
        Target HF = your threshold + 0.2 buffer.<br />
        Max safe debt = weighted collateral ÷ target HF.<br />
        Suggested repay = current debt − max safe debt.
      </InfoBox>

      {/* ── Yield Optimizer ─────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 8, marginTop: 40 }}>
        03 — YIELD OPTIMIZER
      </h2>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", lineHeight: 1.8, marginBottom: 28 }}>
        Monitors the xUSDC supply APY and notifies you when the rate exceeds your target.
        When APY crosses your threshold, a deposit recommendation appears — one click to supply.
      </p>

      <div style={{ border: "3px solid #000", padding: "20px 24px", marginBottom: 32, background: "#f9f9f9", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>EXAMPLE</div>
        <div>You set threshold: 5%</div>
        <div>Protocol utilization rises → APY reaches 6.2%</div>
        <div style={{ color: "#34c759" }}>✓ OPPORTUNITY: APY exceeds your threshold</div>
        <div>Deposit xUSDC now to earn 6.2% APY</div>
      </div>

      <InfoBox>
        APY is variable — it changes with utilization. High utilization = high borrow demand = high supply APY.
        The Yield Optimizer updates every 4 seconds when the dashboard is open.
      </InfoBox>

      {/* ── Comparison ─────────────────────────────────────────── */}
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, marginBottom: 16, marginTop: 40 }}>
        AGENT COMPARISON
      </h2>

      <Table
        headers={["Agent", "Who benefits", "Runs where", "Action required"]}
        rows={[
          ["Liquidation Bot", "Protocol + bot operator", "VPS (24/7 autonomous)", "None — fully automatic"],
          ["Guardian Agent", "You (borrower)", "Your browser", "Click Repay when alert fires"],
          ["Yield Optimizer", "You (lender)", "Your browser", "Click Supply when alert fires"],
        ]}
      />

      <div style={{ border: "3px solid #000", padding: "24px", background: "#fff", marginTop: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, marginBottom: 12 }}>LIVE BOT STATUS</div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "#444", margin: 0, lineHeight: 1.7 }}>
          Check the current bot wallet balance, recent liquidations, and live status in the{" "}
          <strong>Dashboard → AGENTS</strong> tab. The panel refreshes every 30 seconds.
        </p>
      </div>
    </DocPage>
  );
}
