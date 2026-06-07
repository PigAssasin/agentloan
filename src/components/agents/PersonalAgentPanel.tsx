"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { ARC_TESTNET_CONTRACTS } from "../../../config/contracts";
import LendingPoolABI  from "@/lib/abi-lending-pool.json";
import MockERC20ABI    from "@/lib/abi-mock-erc20.json";

// ── Types ─────────────────────────────────────────────────────────────────

interface AgentStatus {
  healthFactor:   string;
  totalDebtUSD:   string;
  isAuthorized:   boolean;
  approvedAmount: string;
  hasTelegram:    boolean;
}

interface AgentSettings {
  enabled:     boolean;
  hfTarget:    number;
  llmProvider: string | null;
  hasLlmKey:   boolean;
  hasTelegram: boolean;
}

interface AgentAction {
  action:     string;
  reason:     string | null;
  amount_usd: number | null;
  hf_before:  number | null;
  hf_after:   number | null;
  tx_hash:    string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const S: React.CSSProperties = { fontFamily: "var(--font-body)" };
const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const HEAD: React.CSSProperties = { fontFamily: "var(--font-heading)" };

function fmtTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function actionLabel(action: string): string {
  if (action === "emergency_protect") return "⚡ Emergency repay";
  if (action === "deploy_yield")      return "📈 Deployed to yield";
  if (action === "repay")             return "↩ Repaid";
  if (action === "skip")              return "— Skipped";
  return action;
}

// ── Main Component ────────────────────────────────────────────────────────

export function PersonalAgentPanel() {
  const { address, isConnected } = useAccount();

  const [status,   setStatus]   = useState<AgentStatus | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [actions,  setActions]  = useState<AgentAction[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [hfInput,    setHfInput]    = useState("1.30");
  const [showHistory, setShowHistory] = useState(false);
  const [txError,    setTxError]    = useState<string | null>(null);

  // Approve + Authorize tx state
  const { writeContract: writeApprove, data: approveTx, isPending: approveSending } = useWriteContract();
  const { writeContract: writeAuth,    data: authTx,    isPending: authSending }    = useWriteContract();
  const { isSuccess: approveOk, isLoading: approveConfirming } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isSuccess: authOk,    isLoading: authConfirming }    = useWaitForTransactionReceipt({ hash: authTx });
  const approving = approveSending || approveConfirming;
  const authing   = authSending   || authConfirming;

  const loadData = useCallback(async () => {
    if (!address) return;
    const addr = address.toLowerCase();
    const [st, se, ac] = await Promise.all([
      fetch(`/api/personal-agent/status?address=${addr}`).then(r => r.json()),
      fetch(`/api/personal-agent/settings?address=${addr}`).then(r => r.json()),
      fetch(`/api/personal-agent/actions?address=${addr}&limit=5`).then(r => r.json()),
    ]);
    setStatus(st.error   ? null : st);
    setSettings(se.error ? null : se);
    setActions(Array.isArray(ac) ? ac : []);
    if (se?.hfTarget) setHfInput(Number(se.hfTarget).toFixed(2));
    setLoading(false);
  }, [address]);

  useEffect(() => {
    if (isConnected && address) { setLoading(true); loadData(); }
    const id = setInterval(() => { if (isConnected && address) loadData(); }, 30_000);
    return () => clearInterval(id);
  }, [isConnected, address, loadData]);

  // Reload after tx confirmed — small delay to let RPC catch up
  useEffect(() => {
    if (approveOk || authOk) {
      setTimeout(() => loadData(), 1500);
    }
  }, [approveOk, authOk, loadData]);

  if (!isConnected) return null;
  if (loading) return (
    <div style={{ border: "3px solid #000", padding: 24, marginBottom: 24, background: "#fff" }}>
      <div style={{ ...HEAD, fontSize: 18 }}>PERSONAL AGENT</div>
      <div style={{ ...S, fontSize: 13, color: "#999", marginTop: 8 }}>Loading...</div>
    </div>
  );

  const isSetup = status?.isAuthorized && Number(status?.approvedAmount ?? 0) > 0;
  const isActive = isSetup && settings?.enabled;
  const hasDebt = Number(status?.totalDebtUSD ?? 0) > 0;
  const hf = Number(status?.healthFactor ?? 0);
  const hfDanger = hf > 0 && hf < Number(settings?.hfTarget ?? 1.3) + 0.15;

  // ── Setup state ──────────────────────────────────────────────────────────
  async function handleEnable(enabled: boolean) {
    if (!address) return;
    setSaving(true);
    try {
      await fetch("/api/personal-agent/settings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          address:  address.toLowerCase(),
          enabled,
          hfTarget: parseFloat(hfInput),
        }),
      });
      await loadData();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  function handleApprove() {
    if (!address) return;
    setTxError(null);
    writeApprove({
      address:      ARC_TESTNET_CONTRACTS.X_USDC,
      abi:          MockERC20ABI as any,
      functionName: "approve",
      args:         [ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, parseUnits("10000", 6)],
    }, {
      onError: (e) => setTxError(e.message?.slice(0, 120)),
    });
  }

  function handleAuthorize() {
    if (!address) return;
    setTxError(null);
    writeAuth({
      address:      ARC_TESTNET_CONTRACTS.LENDING_POOL,
      abi:          LendingPoolABI as any,
      functionName: "authorizeAgent",
      args:         [ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, true],
    }, {
      onError: (e) => setTxError(e.message?.slice(0, 120)),
    });
  }

  const step1Done = Number(status?.approvedAmount ?? 0) > 0;
  const step2Done = status?.isAuthorized ?? false;

  return (
    <div style={{ border: "3px solid #000", padding: 24, background: "#fff", marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ ...HEAD, fontSize: 18 }}>PERSONAL AGENT</div>
        <div style={{
          ...MONO, fontSize: 11, fontWeight: 700,
          background: isActive ? "#000" : "#888",
          color: "#fff", padding: "3px 12px",
        }}>
          {isActive ? "● ACTIVE" : "○ INACTIVE"}
        </div>
      </div>

      {/* Setup wizard — show if not fully set up */}
      {!isSetup && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...S, fontSize: 13, color: "#444", marginBottom: 16 }}>
            Set up once — agent runs 24/7 to protect and grow your position.
          </div>

          {txError && (
            <div style={{ ...S, fontSize: 12, color: "#c00", background: "#fff0f0", border: "1px solid #fcc", padding: "8px 12px", marginBottom: 12, borderRadius: 2 }}>
              {txError}
            </div>
          )}

          {/* Step 1: Approve */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ ...MONO, fontSize: 13, color: step1Done ? "#008000" : "#000", minWidth: 24 }}>
              {step1Done ? "✓" : "①"}
            </div>
            <div style={{ ...S, fontSize: 13, flex: 1 }}>
              Approve xUSDC to agent executor
            </div>
            {!step1Done && (
              <button onClick={handleApprove} disabled={approving}
                style={{ border: "2px solid #000", background: approving ? "#eee" : "#000", color: approving ? "#999" : "#fff", padding: "6px 16px", ...S, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {approveSending ? "SIGN IN WALLET..." : approveConfirming ? "CONFIRMING..." : "APPROVE →"}
              </button>
            )}
          </div>

          {/* Step 2: Authorize */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ ...MONO, fontSize: 13, color: step2Done ? "#008000" : "#000", minWidth: 24 }}>
              {step2Done ? "✓" : "②"}
            </div>
            <div style={{ ...S, fontSize: 13, flex: 1 }}>
              Authorize agent in LendingPool
            </div>
            {!step2Done && (
              <button onClick={handleAuthorize} disabled={authing}
                style={{ border: "2px solid #000", background: authing ? "#eee" : "#000", color: authing ? "#999" : "#fff", padding: "6px 16px", ...S, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {authSending ? "SIGN IN WALLET..." : authConfirming ? "CONFIRMING..." : "AUTHORIZE →"}
              </button>
            )}
          </div>

          {/* Step 3: HF target + activate */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <div style={{ ...MONO, fontSize: 13, color: "#999", minWidth: 24 }}>③</div>
            <div style={{ ...S, fontSize: 13 }}>HF Target</div>
            <input type="number" min="1.1" max="3.0" step="0.05" value={hfInput}
              onChange={e => setHfInput(e.target.value)}
              style={{ border: "2px solid #000", padding: "5px 10px", ...MONO, fontSize: 13, width: 70, background: "#fff" }} />
            <button onClick={() => handleEnable(true)}
              disabled={!step1Done || !step2Done || saving}
              style={{ border: "2px solid #000", background: (!step1Done || !step2Done || saving) ? "#eee" : "#000", color: (!step1Done || !step2Done || saving) ? "#999" : "#fff", padding: "6px 20px", ...S, fontSize: 12, fontWeight: 700, cursor: "pointer", flex: 1 }}>
              {saving ? "ACTIVATING..." : "ACTIVATE AGENT"}
            </button>
          </div>
        </div>
      )}

      {/* Active state */}
      {isSetup && (
        <>
          {/* HF row */}
          {hasDebt && (
            <div style={{ display: "flex", gap: 24, marginBottom: 16, padding: "12px 16px", background: hfDanger ? "#fff8e1" : "#f9f9f9", border: `2px solid ${hfDanger ? "#ff9800" : "#ddd"}` }}>
              <div>
                <div style={{ ...S, fontSize: 11, color: "#666", marginBottom: 2 }}>HEALTH FACTOR</div>
                <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color: hfDanger ? "#e65100" : "#000" }}>{hf.toFixed(3)}</div>
              </div>
              <div>
                <div style={{ ...S, fontSize: 11, color: "#666", marginBottom: 2 }}>TARGET</div>
                <div style={{ ...MONO, fontSize: 20, color: "#666" }}>{settings?.hfTarget?.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ ...S, fontSize: 11, color: "#666", marginBottom: 2 }}>RESERVE</div>
                <div style={{ ...MONO, fontSize: 14, marginTop: 4 }}>${Number(status?.approvedAmount).toLocaleString()} approved</div>
              </div>
            </div>
          )}

          {!hasDebt && (
            <div style={{ ...S, fontSize: 13, color: "#666", marginBottom: 16 }}>
              No active borrow position. Agent will deploy idle xUSDC to yield when available.
            </div>
          )}

          {/* Last action */}
          {actions[0] && (
            <div style={{ padding: "10px 14px", background: "#f5f5f5", borderLeft: "4px solid #000", marginBottom: 16 }}>
              <div style={{ ...S, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {actionLabel(actions[0].action)}
              </div>
              {actions[0].amount_usd && (
                <div style={{ ...MONO, fontSize: 12, color: "#444" }}>
                  ${actions[0].amount_usd.toFixed(0)} · HF {(actions[0].hf_before ?? 0).toFixed(2)} → {(actions[0].hf_after ?? 0).toFixed(2)}
                </div>
              )}
              <div style={{ ...S, fontSize: 11, color: "#999", marginTop: 2 }}>
                {fmtTime(actions[0].created_at)}
                {actions[0].tx_hash && (
                  <> · <a href={`https://testnet.arcscan.app/tx/${actions[0].tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ color: "#000" }}>TX ↗</a></>
                )}
              </div>
            </div>
          )}

          {/* Telegram */}
          <div style={{ ...S, fontSize: 12, color: "#666", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span>Telegram:</span>
            {status?.hasTelegram ? (
              <span style={{ color: "#008000", fontWeight: 700 }}>● Connected</span>
            ) : (
              <span>
                Not linked — send <code style={{ background: "#f0f0f0", padding: "1px 6px" }}>/start {address?.toLowerCase()}</code> to @AgentLoanBot
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {settings?.enabled ? (
              <button onClick={() => handleEnable(false)} disabled={saving}
                style={{ border: "2px solid #000", background: "#fff", color: "#000", padding: "7px 16px", ...S, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "..." : "DISABLE"}
              </button>
            ) : (
              <button onClick={() => handleEnable(true)} disabled={saving}
                style={{ border: "2px solid #000", background: "#000", color: "#fff", padding: "7px 16px", ...S, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "..." : "ENABLE"}
              </button>
            )}
            <button onClick={() => setShowHistory(h => !h)}
              style={{ border: "2px solid #ddd", background: "#fff", color: "#444", padding: "7px 16px", ...S, fontSize: 12, cursor: "pointer" }}>
              {showHistory ? "HIDE HISTORY" : "VIEW HISTORY"}
            </button>
          </div>

          {/* History */}
          {showHistory && actions.length > 0 && (
            <div style={{ marginTop: 16, borderTop: "2px solid #eee", paddingTop: 16 }}>
              {actions.map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <div>
                    <div style={{ ...S, fontSize: 12, fontWeight: 700 }}>{actionLabel(a.action)}</div>
                    {a.amount_usd && (
                      <div style={{ ...MONO, fontSize: 11, color: "#666" }}>
                        ${a.amount_usd.toFixed(0)} · HF {(a.hf_before ?? 0).toFixed(2)}→{(a.hf_after ?? 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div style={{ ...S, fontSize: 11, color: "#999", textAlign: "right" }}>
                    {fmtTime(a.created_at)}
                    {a.tx_hash && <><br /><a href={`https://testnet.arcscan.app/tx/${a.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ color: "#000" }}>TX ↗</a></>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showHistory && actions.length === 0 && (
            <div style={{ ...S, fontSize: 12, color: "#999", marginTop: 12 }}>No actions yet.</div>
          )}
        </>
      )}
    </div>
  );
}
