/**
 * ArcBank Signal Agent — x402-inspired HTTP server
 *
 * Scans all borrowers every 5s for HF < 1.1 (pre-liquidation warning).
 * Sells signals via x402 protocol: 1 xUSDC → 1000 signals (24h session).
 *
 * x402 Payment Flow:
 *   GET /v1/signals                    → 402 with pricing info
 *   GET /v1/signals + X-Payment-Tx    → verify ERC-20 transfer → issue session
 *   GET /v1/signals + X-Session-Id    → serve signals (1000 per session)
 *
 * Env vars (.env.local in /root/arcbank):
 *   NEXT_PUBLIC_ARC_RPC      Arc Testnet RPC
 *   SIGNAL_AGENT_ADDRESS     This server's wallet (receives xUSDC payment)
 *   SIGNAL_AGENT_PORT        HTTP port (default: 3001)
 *   SIGNAL_AGENT_ERC8004_ID  ERC-8004 identity (set after register-signal-agent.ts)
 */
import express, { Request, Response } from "express";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import { createPublicClient, http, parseAbiItem, encodeFunctionData,
         decodeFunctionResult, formatUnits, type Address } from "viem";

dotenv.config({ path: "/root/arcbank/.env.local" });

const RPC_URL       = process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network";
const AGENT_ADDRESS = (process.env.SIGNAL_AGENT_ADDRESS ?? "") as Address;
const PORT          = parseInt(process.env.SIGNAL_AGENT_PORT ?? "3001");
const POOL          = "0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec" as Address;
const X_USDC        = "0xFa090bd1A524D861542888B6c5e7965dde1F4f35" as Address;
const MULTICALL3    = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;

const chain = {
  id: 5042002, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const client = createPublicClient({ chain, transport: http(RPC_URL) });

const MC3_ABI = [{
  name: "aggregate3", type: "function", stateMutability: "view",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target",       type: "address" },
    { name: "allowFailure", type: "bool"    },
    { name: "callData",     type: "bytes"   },
  ]}],
  outputs: [{ name: "returnData", type: "tuple[]", components: [
    { name: "success",    type: "bool"  },
    { name: "returnData", type: "bytes" },
  ]}],
}] as const;

const BORROW_EVENT   = parseAbiItem("event Borrow(address indexed token, address indexed user, uint256 amount)");
const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

// ── State ──────────────────────────────────────────────────────────────────

interface Session {
  remaining: number;
  expiresAt: number;  // unix ms
  paidBy:    string;
}

const sessions      = new Map<string, Session>();
const usedTxHashes  = new Set<string>(); // prevent replay attacks

export interface Signal {
  borrower:       string;
  healthFactor:   string;
  totalDebtUSD:   string;
  estimatedBonus: string;
}

let cachedSignals:  Signal[] = [];
let lastScanAt:     number   = 0;
let scanCount:      number   = 0;
let totalPaid:      bigint   = 0n;
let sessionsIssued: number   = 0;

// ── HF Scanner (every 5s) ─────────────────────────────────────────────────

async function scanPositions() {
  try {
    const latest = await client.getBlockNumber();
    const from   = latest > 50_000n ? latest - 50_000n : 0n;

    const logs = await client.getLogs({
      address: POOL, event: BORROW_EVENT,
      fromBlock: from, toBlock: latest,
    });

    const borrowers = [
      ...new Set(logs.map(l => (l as any).args?.user?.toLowerCase()).filter(Boolean)),
    ] as Address[];
    if (borrowers.length === 0) { cachedSignals = []; lastScanAt = Date.now(); return; }

    // Load ABI from arcbank (same VPS)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const LendingPoolABI = require("/root/arcbank/src/lib/abi-lending-pool.json");

    const calls = borrowers.map(u => ({
      target: POOL, allowFailure: true,
      callData: encodeFunctionData({ abi: LendingPoolABI, functionName: "getUserAccountData", args: [u] }),
    }));

    const results = await client.readContract({
      address: MULTICALL3, abi: MC3_ABI, functionName: "aggregate3", args: [calls],
    }) as Array<{ success: boolean; returnData: `0x${string}` }>;

    const WAD = 10n ** 18n;
    const signals: Signal[] = [];

    for (let i = 0; i < results.length; i++) {
      if (!results[i].success) continue;
      try {
        const d = decodeFunctionResult({
          abi: LendingPoolABI, functionName: "getUserAccountData", data: results[i].returnData,
        }) as any;
        if (d.totalDebtUSD === 0n) continue;
        // Warn at HF < 1.1 — before liquidation threshold of 1.0
        if (d.healthFactor >= WAD * 11n / 10n) continue;
        signals.push({
          borrower:       borrowers[i],
          healthFactor:   (Number(d.healthFactor) / 1e18).toFixed(4),
          totalDebtUSD:   formatUnits(d.totalDebtUSD, 18),
          estimatedBonus: formatUnits(d.totalDebtUSD / 2n * 5n / 100n, 18),
        });
      } catch { continue; }
    }

    cachedSignals = signals.sort((a, b) => parseFloat(a.healthFactor) - parseFloat(b.healthFactor));
    lastScanAt    = Date.now();
    scanCount++;
    if (signals.length > 0) {
      console.log(`[scan #${scanCount}] ${signals.length} signal(s) | HF: ${signals.map(s => s.healthFactor).join(", ")}`);
    }
  } catch (e: any) {
    console.error("Scan error:", (e.message ?? "").slice(0, 80));
  }
}

// ── Payment verification ───────────────────────────────────────────────────

async function verifyPayment(txHash: string): Promise<string | null> {
  if (usedTxHashes.has(txHash)) {
    console.warn("Replay attack: txHash already used:", txHash.slice(0, 14));
    return null;
  }
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success") return null;

    const logs = await client.getLogs({
      address: X_USDC, event: TRANSFER_EVENT,
      fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    });

    for (const log of logs) {
      const l = log as any;
      if (l.args?.to?.toLowerCase() === AGENT_ADDRESS.toLowerCase()) {
        const amount = (l.args?.value as bigint) ?? 0n;
        if (amount >= 1_000_000n) { // minimum 1 xUSDC (6 decimals)
          usedTxHashes.add(txHash);  // prevent replay
          totalPaid += amount;
          return l.args?.from as string;
        }
      }
    }
    return null;
  } catch (e: any) {
    console.error("Payment verify error:", (e.message ?? "").slice(0, 60));
    return null;
  }
}

// ── Express app ────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Add CORS for local development
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "X-Session-Id, X-Payment-Tx");
  next();
});

// GET /v1/signals — x402 protocol entry point
app.get("/v1/signals", async (req: Request, res: Response) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  const paymentTx = req.headers["x-payment-tx"] as string | undefined;

  const priceHeader = Buffer.from(JSON.stringify({
    x402Version: "1.0",
    resource:    { method: "GET", uri: "/v1/signals" },
    price:       "1",
    currency:    "xUSDC",
    payTo:       AGENT_ADDRESS,
    signals:     1000,
    validity:    "24h",
    network:     "eip155:5042002",
  })).toString("base64");

  // ── Active session ─────────────────────────────────────────────────────
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.remaining <= 0 || Date.now() > session.expiresAt) {
      sessions.delete(sessionId);
      return res.status(402).json({
        error: "Session expired or exhausted — please pay again",
        "x-payment-required": priceHeader,
      });
    }
    session.remaining--;
    res.setHeader("X-Session-Remaining", session.remaining.toString());
    return res.json({
      signals:   cachedSignals,
      scanAge:   Date.now() - lastScanAt,
      agentId:   process.env.SIGNAL_AGENT_ERC8004_ID ?? "unregistered",
    });
  }

  // ── Payment tx provided → verify + issue session ───────────────────────
  if (paymentTx) {
    console.log("Verifying payment tx:", paymentTx.slice(0, 14), "...");
    const payer = await verifyPayment(paymentTx);
    if (!payer) {
      return res.status(402).json({
        error: "Payment verification failed — ensure 1 xUSDC was sent",
        "x-payment-required": priceHeader,
      });
    }
    const id = crypto.randomUUID();
    sessions.set(id, { remaining: 1000, expiresAt: Date.now() + 86_400_000, paidBy: payer });
    sessionsIssued++;
    console.log(`Session issued: ${id.slice(0, 8)}... for ${payer.slice(0, 10)}...`);
    res.setHeader("X-Session-Id", id);
    return res.json({
      signals:   cachedSignals,
      sessionId: id,
      remaining: 1000,
      scanAge:   Date.now() - lastScanAt,
    });
  }

  // ── No payment → 402 ──────────────────────────────────────────────────
  return res.status(402).json({
    error: "Payment required — send 1 xUSDC to get 1000 signals (24h)",
    "x-payment-required": priceHeader,
  });
});

// GET /v1/status — public stats, no payment needed
app.get("/v1/status", (_req: Request, res: Response) => {
  // Cleanup expired sessions first
  for (const [id, s] of sessions) {
    if (Date.now() > s.expiresAt || s.remaining <= 0) sessions.delete(id);
  }
  res.json({
    online:           true,
    activeSessions:   sessions.size,
    sessionsIssued,
    signalsAvailable: cachedSignals.length,
    lastScanAt,
    scanCount,
    totalPaidUsdc:    formatUnits(totalPaid, 6),
    agentAddress:     AGENT_ADDRESS,
    agentId:          process.env.SIGNAL_AGENT_ERC8004_ID ?? "unregistered",
  });
});

// ── Start ──────────────────────────────────────────────────────────────────

if (!AGENT_ADDRESS) {
  console.error("ERROR: SIGNAL_AGENT_ADDRESS not set. Add to .env.local");
  process.exit(1);
}

scanPositions();
setInterval(scanPositions, 5_000);

// Cleanup expired sessions every hour
setInterval(() => {
  let cleaned = 0;
  for (const [id, s] of sessions) {
    if (Date.now() > s.expiresAt || s.remaining <= 0) { sessions.delete(id); cleaned++; }
  }
  if (cleaned > 0) console.log(`Cleaned ${cleaned} expired sessions`);
}, 3_600_000);

app.listen(PORT, () => {
  console.log(`\n📡 ArcBank Signal Agent`);
  console.log(`   Port:     ${PORT}`);
  console.log(`   Payments: ${AGENT_ADDRESS}`);
  console.log(`   Price:    1 xUSDC = 1000 signals (24h)\n`);
});
