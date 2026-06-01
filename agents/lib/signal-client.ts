/**
 * x402 Signal Client — buys early liquidation warnings from Signal Agent.
 *
 * Payment flow:
 *   1. GET /v1/signals → 402 Payment Required (no session)
 *   2. Bot transfers 1 xUSDC to signal agent address
 *   3. GET /v1/signals + X-Payment-Tx: <txHash> → receive session UUID
 *   4. Subsequent: GET /v1/signals + X-Session-Id: <uuid> (no more payment)
 *   5. Session valid 24h / 1000 signals
 *
 * Safety: ALL errors return empty array, NEVER throws.
 * Fallback: caller continues with existing Multicall3 scan.
 */
import { createWalletClient, createPublicClient, http,
         parseUnits, type Address, type WalletClient } from "viem";
import { arcTestnetChain, BOT_CONFIG } from "../config";
import MockERC20ABI from "../../src/lib/abi-mock-erc20.json";

const SIGNAL_AGENT_URL = process.env.SIGNAL_AGENT_URL ?? "http://localhost:3001";
const X_USDC           = BOT_CONFIG.DEBT_TOKEN as Address;
const TIMEOUT_MS       = 5_000;

const pubClient = createPublicClient({
  chain:     arcTestnetChain,
  transport: http(BOT_CONFIG.RPC_URL),
});

// Session persisted across bot cycles
let sessionId:  string | null = null;
let sessionExp: number        = 0;   // unix ms
let sessionRem: number        = 0;

export interface SignalPosition {
  borrower:       string;
  healthFactor:   string;
  totalDebtUSD:   string;
  estimatedBonus: string;
}

/**
 * Fetch signals from Signal Agent using x402 protocol.
 * Pays 1 xUSDC automatically when no valid session exists.
 * Returns [] on any error (safe fallback to Multicall3 scan).
 */
export async function fetchSignals(wallet: WalletClient): Promise<SignalPosition[]> {
  try {
    // ── Try existing session ───────────────────────────────────────────
    if (sessionId && sessionRem > 0 && Date.now() < sessionExp) {
      const res = await fetch(`${SIGNAL_AGENT_URL}/v1/signals`, {
        headers: { "X-Session-Id": sessionId },
        signal:  AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        const data = await res.json() as { signals?: SignalPosition[] };
        const rem  = parseInt(res.headers.get("X-Session-Remaining") ?? "0");
        if (!isNaN(rem)) sessionRem = rem;
        return data.signals ?? [];
      }
      if (res.status === 402) sessionId = null; // expired
    }

    // ── No session — get pricing info ──────────────────────────────────
    const r402 = await fetch(`${SIGNAL_AGENT_URL}/v1/signals`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r402.status !== 402) return []; // unexpected response

    const body     = await r402.json() as Record<string, string>;
    const pricingB = body["x-payment-required"];
    if (!pricingB) return [];

    const pricing = JSON.parse(Buffer.from(pricingB, "base64").toString()) as Record<string, unknown>;
    const payTo   = pricing.payTo as Address | undefined;
    if (!payTo) return [];

    if (BOT_CONFIG.DRY_RUN) {
      console.log(`    [DRY_RUN] Would pay 1 xUSDC to Signal Agent ${payTo.slice(0, 10)}...`);
      return [];
    }

    // ── Pay 1 xUSDC (ERC-20 transfer) ─────────────────────────────────
    console.log(`    💳 Paying 1 xUSDC to Signal Agent ${payTo.slice(0, 10)}...`);
    const txHash = await wallet.writeContract({
      address:      X_USDC,
      abi:          MockERC20ABI as any,
      functionName: "transfer",
      args:         [payTo, parseUnits("1", 6)],
    } as any);
    await pubClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`    Payment confirmed: ${txHash.slice(0, 14)}...`);

    // ── Submit tx hash → get session ───────────────────────────────────
    const rSession = await fetch(`${SIGNAL_AGENT_URL}/v1/signals`, {
      headers: { "X-Payment-Tx": txHash },
      signal:  AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!rSession.ok) return [];

    const sData    = await rSession.json() as { signals?: SignalPosition[]; sessionId?: string; remaining?: number };
    sessionId      = rSession.headers.get("X-Session-Id") ?? sData.sessionId ?? null;
    sessionRem     = sData.remaining ?? 1000;
    sessionExp     = Date.now() + 86_400_000; // 24h

    if (sessionId) {
      console.log(`    ✅ Signal session active — ${sessionRem} signals remaining`);
    }
    return sData.signals ?? [];

  } catch {
    // Any error (offline, timeout, payment failed) → silent fallback
    return [];
  }
}

/**
 * Get public status from Signal Agent (no payment, no session needed).
 * Returns null if agent is offline.
 */
export async function getSignalAgentStatus(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${SIGNAL_AGENT_URL}/v1/status`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Current session info for monitoring/display. */
export function getSessionInfo() {
  return {
    active:    !!sessionId && sessionRem > 0 && Date.now() < sessionExp,
    sessionId: sessionId ? sessionId.slice(0, 8) + "..." : null,
    remaining: sessionRem,
    expiresAt: sessionExp,
  };
}
