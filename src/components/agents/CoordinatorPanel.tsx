"use client";
import { useState, useEffect } from "react";

interface CoordinatorStatus {
  active:         boolean;
  ageSeconds?:    number;
  model?:         string;
  strategy?:      string;
  reasoning?:     string;
  priority?:      string[];
  memorySummary?: string;
  decisionsCount?: number;
  reason?:        string;
}

export function CoordinatorPanel() {
  const [status, setStatus] = useState<CoordinatorStatus>({ active: false });

  useEffect(() => {
    const load = () =>
      fetch("/api/coordinator-status")
        .then(r => r.json())
        .then(setStatus)
        .catch(() => setStatus({ active: false }));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const row = (label: string, value: React.ReactNode) => (
    <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f0f0f0", gap: 16 }}>
      <span style={{ fontFamily:"var(--font-body)", fontSize:12, color:"#666", flexShrink:0 }}>{label}</span>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:12, fontWeight:600, color:"#000", textAlign:"right", wordBreak:"break-word" }}>{value}</span>
    </div>
  );

  const ageLabel = status.ageSeconds !== undefined
    ? status.ageSeconds < 60 ? `${status.ageSeconds}s ago` : `${Math.floor(status.ageSeconds/60)}m ago`
    : "—";

  return (
    <div style={{ border:"3px solid #000", marginBottom:24 }}>
      <div style={{ background:"#000", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <span style={{ fontFamily:"var(--font-heading)", fontSize:15, color:"#fff" }}>COORDINATOR AGENT</span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"#888", marginLeft:10 }}>ERC-8004 #34625</span>
        </div>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:11, padding:"2px 10px", borderRadius:100, background: status.active ? "#34c759" : "#ff9500", color:"#fff" }}>
          {status.active ? "ACTIVE" : "IDLE"}
        </span>
      </div>

      <div style={{ padding:"8px 16px" }}>
        {status.active ? (<>
          {row("Last decision", ageLabel)}
          {row("Model", status.model ?? "—")}
          {row("Strategy", <span style={{ fontSize:11, lineHeight:1.5 }}>{status.strategy ?? "—"}</span>)}
          {row("Reasoning", <span style={{ fontSize:11, lineHeight:1.5, color:"#444" }}>{status.reasoning ?? "—"}</span>)}
          {status.priority && status.priority.length > 0 && row(
            "Priority order",
            <span style={{ fontSize:11 }}>{status.priority.slice(0,3).map(a => a.slice(0,10)+"…").join(" → ")}</span>
          )}
          {row("Decisions in memory", status.decisionsCount ?? 0)}
          {status.memorySummary && row("Memory summary", <span style={{ fontSize:11, lineHeight:1.5, color:"#444" }}>{status.memorySummary}</span>)}
        </>) : (
          <div style={{ fontFamily:"var(--font-body)", fontSize:13, color:"#888", padding:"12px 0" }}>
            {status.reason === "no decision yet"
              ? "Waiting for risky positions (HF < 1.1) to trigger AI reasoning."
              : "Coordinator offline or no positions at risk."}
          </div>
        )}
      </div>
    </div>
  );
}
