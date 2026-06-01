"use client";
import { useState, useEffect } from "react";

interface AgentStatus {
  online:            boolean;
  activeSessions?:   number;
  sessionsIssued?:   number;
  signalsAvailable?: number;
  lastScanAt?:       number;
  scanCount?:        number;
  totalPaidUsdc?:    string;
  agentAddress?:     string;
  agentId?:          string;
}

export function SignalMarketTab() {
  const [status,  setStatus]  = useState<AgentStatus>({ online: false });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch("/api/signal-market")
        .then(r => r.json())
        .then(setStatus)
        .catch(() => setStatus({ online: false }));
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (status.lastScanAt) setElapsed(Math.floor((Date.now() - status.lastScanAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status.lastScanAt]);

  const row = (label: string, value: React.ReactNode, accent?: boolean) => (
    <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #f0f0f0" }}>
      <span style={{ fontFamily:"var(--font-body)", fontSize:13, color:"#666" }}>{label}</span>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:600, color: accent ? "#34c759" : "#000" }}>{value}</span>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:"var(--font-heading)", fontSize:22, marginBottom:6 }}>SIGNAL MARKET</div>
        <div style={{ fontFamily:"var(--font-body)", fontSize:13, color:"#666", lineHeight:1.7, maxWidth:560 }}>
          Signal Agent monitors all positions every 5 seconds — 3× faster than the Liquidation Bot.
          Bots pay 1 xUSDC per 1000 signals via x402 protocol to get a 15-30s head start on liquidations.
        </div>
      </div>

      {/* Agent status card */}
      <div style={{ border:"3px solid #000", marginBottom:24 }}>
        <div style={{ background:"#000", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontFamily:"var(--font-heading)", fontSize:15, color:"#fff" }}>SIGNAL AGENT</span>
          <span style={{
            fontFamily:"var(--font-mono)", fontSize:11, padding:"2px 10px", borderRadius:100,
            background: status.online ? "#34c759" : "#ff3b30", color:"#fff",
          }}>
            {status.online ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
        <div style={{ padding:"8px 16px" }}>
          {status.online ? (<>
            {row("ERC-8004 ID",      status.agentId ?? "—")}
            {row("Agent Address",    status.agentAddress ? `${status.agentAddress.slice(0,10)}...${status.agentAddress.slice(-6)}` : "—")}
            {row("Last Scan",        `${elapsed}s ago`)}
            {row("Total Scans",      (status.scanCount ?? 0).toLocaleString("en-US"))}
            {row("Current Signals",  <span style={{ color:(status.signalsAvailable ?? 0) > 0 ? "#ff3b30" : "#34c759" }}>{status.signalsAvailable ?? 0}</span>)}
            {row("Active Sessions",  status.activeSessions ?? 0)}
            {row("Sessions Issued",  status.sessionsIssued ?? 0)}
            {row("Total Revenue",    `${status.totalPaidUsdc ?? "0"} xUSDC`, true)}
          </>) : (
            <div style={{ fontFamily:"var(--font-body)", fontSize:13, color:"#888", padding:"16px 0" }}>
              Signal Agent is offline. Liquidation Bot falls back to direct chain scanning (every ~10s).
            </div>
          )}
        </div>
      </div>

      {/* x402 flow */}
      <div style={{ border:"2px solid #000", padding:"20px 24px", marginBottom:24 }}>
        <div style={{ fontFamily:"var(--font-heading)", fontSize:15, marginBottom:16 }}>HOW x402 PAYMENT WORKS</div>
        <div style={{ display:"grid", gridTemplateColumns:"24px 1fr", gap:"10px 12px", alignItems:"start" }}>
          {[
            ["1", "Bot requests signals → Signal Agent responds 402 Payment Required"],
            ["2", "Bot transfers 1 xUSDC to Signal Agent wallet (ERC-20 transfer)"],
            ["3", "Bot retries with payment tx hash → Agent verifies on-chain"],
            ["4", "Agent issues session UUID — valid for 1000 signals (24 hours)"],
            ["5", "Bot uses session for all requests. No more payment until exhausted."],
          ].map(([n, text]) => (
            <>
              <div key={`n${n}`} style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"#000", paddingTop:1 }}>{n}</div>
              <div key={`t${n}`} style={{ fontFamily:"var(--font-body)", fontSize:13, color:"#444", lineHeight:1.6 }}>{text}</div>
            </>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div style={{ border:"2px solid #e0e0e0", padding:"16px 20px", background:"#fafafa", marginBottom:24 }}>
        <div style={{ fontFamily:"var(--font-heading)", fontSize:13, marginBottom:12 }}>SIGNAL PRICING</div>
        <div style={{ display:"flex", gap:32, flexWrap:"wrap" }}>
          {[
            { label:"Price per session", value:"1 xUSDC" },
            { label:"Signals included",  value:"1,000"   },
            { label:"Session validity",  value:"24 hours" },
            { label:"Scan interval",     value:"5 seconds" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily:"var(--font-body)", fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:16, fontWeight:700, marginTop:4 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Run your own */}
      <div style={{ border:"2px solid #e0e0e0", padding:"16px 20px", background:"#fafafa" }}>
        <div style={{ fontFamily:"var(--font-heading)", fontSize:13, marginBottom:8 }}>RUN YOUR OWN SIGNAL AGENT</div>
        <div style={{ fontFamily:"var(--font-body)", fontSize:12, color:"#666", lineHeight:1.8 }}>
          Anyone can run a Signal Agent and earn xUSDC from bot subscriptions.<br/>
          Clone the repo → set SIGNAL_AGENT_ADDRESS → pm2 start signal-agent<br/>
          The more Signal Agents running, the healthier the protocol.
        </div>
      </div>
    </div>
  );
}
