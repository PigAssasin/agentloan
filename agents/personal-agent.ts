/**
 * AgentLoan Personal Agent
 *
 * Two-tier decision engine:
 *   Tier 1 (every 20 blocks, $0): Multicall3 HF reads + urgency scoring
 *   Tier 2 (on event, 5-min cooldown per user): LLM reasoning with memory context
 *
 * Actions:
 *   emergency_protect: withdrawFor + repayFor atomic via AgentExecutor
 *   deploy_yield:      deployToYield — pull idle xUSDC from wallet → pool
 *
 * ERC-8004: records reputation after each action (Agent ID #67459)
 * Telegram: notifies user's linked chat_id after every action
 */
import * as dotenv from "dotenv";
import * as path   from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Supabase via REST API — avoids SDK module resolution issues with ts-node nodenext
// Same functionality, no dependency required
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits, keccak256, toHex } from "viem";
import { privateKeyToAccount }               from "viem/accounts";
import { callLLM }                           from "./lib/gemini-client";
import { getPositionsBatch, UserPosition }   from "./lib/pool-reader";
import { ARC_TESTNET_CONTRACTS, ARC_AGENT_REGISTRY, AGENT_IDS } from "../config/contracts";

// ── Config ─────────────────────────────────────────────────────────────────

const DRY_RUN      = process.env.DRY_RUN === "true";
const MIN_LLM_MS   = 5 * 60 * 1000;   // 5 min between LLM calls per user
const MIN_DEPLOY   = parseUnits("10", 6); // minimum $10 xUSDC to deploy
const MIN_COVERAGE = 0.10;              // skip partial repay if <10% coverage

const arcChain = {
  id: 5042002 as const, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network"] } },
} as const;

const publicClient = createPublicClient({ chain: arcChain, transport: http() });

// Deployer wallet — used to record ERC-8004 reputation (validator != owner per spec)
const deployerAccount   = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
const deployerWallet    = createWalletClient({ account: deployerAccount, chain: arcChain, transport: http() });

// Supabase REST API (no SDK — avoids module resolution issues with ts-node nodenext)
const SB_URL     = process.env.SUPABASE_URL!;
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" };

// ── ABIs ────────────────────────────────────────────────────────────────────

const EXECUTOR_ABI = parseAbi([
  "function emergencyProtect(address user, uint256 repayAmount) external",
  "function repayFromWallet(address user, uint256 repayAmount) external",
  "function deployToYield(address user, uint256 amount) external",
]);

const POOL_ABI = parseAbi([
  "function getUserAccountData(address) external view returns (uint256 totalCollateralUSD, uint256 totalRawCollateralUSD, uint256 totalDebtUSD, uint256 availableBorrowsUSD, uint256 healthFactor)",
  "function agentAuthorized(address,address) external view returns (bool)",
  "function getUserSupplyBalance(address token, address user) external view returns (uint256)",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address,address) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
]);

const REPUTATION_ABI = parseAbi([
  "function giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32) external",
]);

// pool-reader.ts handles Multicall3 internally via getPositionsBatch

// ── Types ───────────────────────────────────────────────────────────────────

interface UserSub {
  wallet_address:  string;
  hf_target:       number;
  enabled:         boolean;
  last_llm_call_at: string | null;
  llm_api_key_enc:  string | null;
}

interface Decision {
  action:    "emergency_protect" | "repay" | "deploy_yield" | "skip";
  amountUsd: number;
  reason:    string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getEnabledUsers(): Promise<UserSub[]> {
  const url = new URL(`${SB_URL}/rest/v1/user_agent_subscriptions`);
  url.searchParams.set("select", "wallet_address,hf_target,enabled,last_llm_call_at,llm_api_key_enc");
  url.searchParams.set("enabled", "eq.true");
  url.searchParams.set("agent_type", "eq.personal");
  const res = await fetch(url.toString(), { headers: SB_HEADERS });
  return res.ok ? res.json() : [];
}

async function getHFBatch(wallets: string[]): Promise<Map<string, { hf: number; debtUSD: number; weightedColl: number }>> {
  if (!wallets.length) return new Map();
  const positions: UserPosition[] = await getPositionsBatch(wallets as `0x${string}`[]);
  const map = new Map<string, { hf: number; debtUSD: number; weightedColl: number }>();
  for (const p of positions) {
    const hf      = Number(p.healthFactor) / 1e18;
    const debtUSD = Number(p.totalDebtUSD) / 1e18;
    // Derive weighted collateral from HF formula: HF = weightedColl / debt
    // This avoids pool-reader's raw vs weighted naming confusion
    const weightedColl = hf * debtUSD;
    map.set(p.address.toLowerCase(), { hf, debtUSD, weightedColl });
  }
  return map;
}

function calcRepayAmount(debtUSD: number, weightedColl: number, targetHF: number): bigint {
  const repayUSD = Math.max(0, debtUSD - weightedColl / targetHF);
  return parseUnits(repayUSD.toFixed(6), 6);
}

function shouldCallLLM(user: UserSub): boolean {
  if (!user.last_llm_call_at) return true;
  return Date.now() - new Date(user.last_llm_call_at).getTime() > MIN_LLM_MS;
}

async function updateLastLLMCall(wallet: string) {
  const url = new URL(`${SB_URL}/rest/v1/user_agent_subscriptions`);
  url.searchParams.set("wallet_address", `eq.${wallet}`);
  await fetch(url.toString(), {
    method: "PATCH", headers: SB_HEADERS,
    body: JSON.stringify({ last_llm_call_at: new Date().toISOString() }),
  });
}

function decideRuleBased(user: UserSub, hf: number, debtUSD: number, weightedColl: number, idleUSDC: bigint): Decision {
  if (hf < user.hf_target) {
    const repayUSD = Math.max(0, debtUSD - weightedColl / (user.hf_target + 0.15));
    return { action: "repay", amountUsd: repayUSD, reason: `HF ${hf.toFixed(2)} < target ${user.hf_target} (rule-based)` };
  }
  if (idleUSDC >= MIN_DEPLOY && hf > user.hf_target + 0.3) {
    return { action: "deploy_yield", amountUsd: Number(idleUSDC) / 1e6, reason: "Idle xUSDC, HF safe" };
  }
  return { action: "skip", amountUsd: 0, reason: "No action needed" };
}

async function decideLLM(user: UserSub, hf: number, debtUSD: number, weightedColl: number, approved: bigint): Promise<Decision> {
  const memUrl = new URL(`${SB_URL}/rest/v1/agent_memory`);
  memUrl.searchParams.set("select", "content");
  memUrl.searchParams.set("wallet_address", `eq.${user.wallet_address}`);
  memUrl.searchParams.set("order", "created_at.desc");
  memUrl.searchParams.set("limit", "10");
  const memories: { content: string }[] = await fetch(memUrl.toString(), { headers: SB_HEADERS }).then(r => r.json()).catch(() => []);

  const prompt = `You are a DeFi position manager for wallet ${user.wallet_address.slice(0,10)}...

CURRENT STATE:
- Health Factor: ${hf.toFixed(3)} (target: ${user.hf_target})
- Total debt: $${debtUSD.toFixed(0)}
- Weighted collateral: $${weightedColl.toFixed(0)}
- xUSDC approved to agent: $${(Number(approved)/1e6).toFixed(0)}

USER MEMORY:
${(memories ?? []).map(m => `- ${m.content}`).join("\n") || "- No history yet"}

ACTIONS:
  repay(amount_usd)        — repay xUSDC debt, improves HF
  deploy_yield(amount_usd) — supply idle xUSDC to pool, earn APY
  skip                     — no action

Respond in JSON only: {"action":"repay"|"deploy_yield"|"skip","amount_usd":0,"reason":"..."}`;

  try {
    const resp = await callLLM(prompt);
    const start = resp.text.indexOf("{");
    const end   = resp.text.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("no JSON");
    return JSON.parse(resp.text.slice(start, end + 1)) as Decision;
  } catch {
    return decideRuleBased(user, hf, debtUSD, weightedColl, 0n);
  }
}

async function notifyUser(wallet: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const tgUrl = new URL(`${SB_URL}/rest/v1/telegram_connections`);
  tgUrl.searchParams.set("select", "chat_id");
  tgUrl.searchParams.set("wallet_address", `eq.${wallet}`);
  tgUrl.searchParams.set("limit", "1");
  const tgRows: { chat_id: string }[] = await fetch(tgUrl.toString(), { headers: SB_HEADERS }).then(r => r.json()).catch(() => []);
  const conn = tgRows[0];
  if (!conn) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: conn.chat_id, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

async function logAction(wallet: string, action: string, data: {
  reason: string; amountUsd?: number; hfBefore?: number; hfAfter?: number;
  txHash?: string; success: boolean; error?: string;
}) {
  await fetch(`${SB_URL}/rest/v1/agent_actions`, {
    method: "POST", headers: SB_HEADERS,
    body: JSON.stringify({
      wallet_address: wallet, agent_type: "personal",
      action, reason: data.reason, amount_usd: data.amountUsd,
      hf_before: data.hfBefore, hf_after: data.hfAfter,
      success: data.success, tx_hash: data.txHash, error: data.error,
    }),
  }).catch(() => {});
}

async function saveMemory(wallet: string, content: string) {
  await fetch(`${SB_URL}/rest/v1/agent_memory`, {
    method: "POST", headers: SB_HEADERS,
    body: JSON.stringify({ wallet_address: wallet, agent_type: "personal", type: "outcome", content }),
  }).catch(() => {});
}

async function recordReputation(tag: string, score: number) {
  if (DRY_RUN || !AGENT_IDS.PERSONAL_AGENT) return;
  try {
    const feedbackHash = keccak256(toHex(tag));
    await deployerWallet.writeContract({
      address:      ARC_AGENT_REGISTRY.REPUTATION_REGISTRY,
      abi:          REPUTATION_ABI,
      functionName: "giveFeedback",
      args:         [BigInt(AGENT_IDS.PERSONAL_AGENT), BigInt(score), 0, tag, "", "", "", feedbackHash],
    });
  } catch (e) {
    // Non-critical — never block main flow
    console.warn("    [reputation] failed:", (e as Error).message?.slice(0, 60));
  }
}

// ── Main execution loop ──────────────────────────────────────────────────────

let isRunning = false;

async function runCycle() {
  const users = await getEnabledUsers();
  if (!users.length) return;

  const hfMap = await getHFBatch(users.map(u => u.wallet_address));

  for (const user of users) {
    const pos = hfMap.get(user.wallet_address);
    if (!pos || pos.debtUSD === 0) continue;

    const { hf, debtUSD, weightedColl } = pos;
    // Urgency 1 threshold uses strict gap to avoid floating-point boundary triggers
    // e.g. target=1.30 → only trigger urgency 1 if HF < 1.43 (not 1.45)
    const urgency = hf < 1.05 ? 3 : hf < user.hf_target ? 2 : hf < user.hf_target + 0.13 ? 1 : 0;
    if (urgency === 0) continue;

    // Check authorization (on-chain)
    const authorized = await publicClient.readContract({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI,
      functionName: "agentAuthorized",
      args: [user.wallet_address as `0x${string}`, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR],
    }).catch(() => false);
    if (!authorized) continue;

    const [approved, walletBalance] = await Promise.all([
      publicClient.readContract({
        address: ARC_TESTNET_CONTRACTS.X_USDC, abi: ERC20_ABI,
        functionName: "allowance",
        args: [user.wallet_address as `0x${string}`, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR],
      }),
      publicClient.readContract({
        address: ARC_TESTNET_CONTRACTS.X_USDC, abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [user.wallet_address as `0x${string}`],
      }),
    ]) as [bigint, bigint];

    let decision: Decision;
    if (urgency >= 3) {
      // Emergency — skip LLM
      const repayUSD = Math.max(0, debtUSD - weightedColl / (user.hf_target + 0.2));
      decision = { action: "emergency_protect", amountUsd: repayUSD, reason: `HF ${hf.toFixed(2)} < 1.05 — emergency` };
    } else if (shouldCallLLM(user)) {
      decision = await decideLLM(user, hf, debtUSD, weightedColl, approved as bigint);
      await updateLastLLMCall(user.wallet_address);
    } else {
      decision = decideRuleBased(user, hf, debtUSD, weightedColl, walletBalance as bigint);
    }

    if (decision.action === "skip") continue;

    // ── Execute repay ──────────────────────────────────────────────────────
    if (decision.action === "emergency_protect" || decision.action === "repay") {
      const repayAmount = calcRepayAmount(debtUSD, weightedColl, user.hf_target + 0.15);

      // Guard: skip if HF already safely above target (LLM sometimes hallucinates repay)
      // Also skip if repay amount < $10 (floating point noise, not worth gas)
      if (hf >= user.hf_target + 0.10 || repayAmount < parseUnits("10", 6)) {
        console.log(`  [skip] ${user.wallet_address.slice(0,10)}... HF ${hf.toFixed(3)} safe or repay tiny`);
        continue;
      }

      const actual = repayAmount > (approved as bigint) ? (approved as bigint) : repayAmount;

      // Min coverage check
      if (repayAmount > 0n && Number(actual) / Number(repayAmount) < MIN_COVERAGE) {
        const msg = `⚠️ Agent cannot act: insufficient reserve.\nNeed $${decision.amountUsd.toFixed(0)}, have $${(Number(approved)/1e6).toFixed(0)} approved.\nAdd more xUSDC approval to enable protection.`;
        await logAction(user.wallet_address, "skip", { reason: "Insufficient reserve", success: false });
        await notifyUser(user.wallet_address, msg);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY_RUN] Would emergencyProtect ${user.wallet_address.slice(0,10)}... $${(Number(actual)/1e6).toFixed(0)}`);
        continue;
      }

      try {
        // Prefer repayFromWallet: pulls from user wallet, no HF side-effect
        // emergencyProtect fails when xUSDC is both collateral AND debt
        // (withdrawing collateral drops HF before repay can execute)
        const functionName = (walletBalance as bigint) >= actual
          ? "repayFromWallet"
          : "emergencyProtect";

        const hash = await deployerWallet.writeContract({
          address:      ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR,
          abi:          EXECUTOR_ABI,
          functionName,
          args:         [user.wallet_address as `0x${string}`, actual],
        });
        await publicClient.waitForTransactionReceipt({ hash });

        // Read hfAfter
        const posAfter = await hfMap.get(user.wallet_address); // use cached, then re-read
        const hfAfterData = await publicClient.readContract({
          address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI,
          functionName: "getUserAccountData", args: [user.wallet_address as `0x${string}`],
        }) as unknown as bigint[];
        const hfAfter = Number(hfAfterData[4]) / 1e18; // index 4 = healthFactor in 5-field struct

        await logAction(user.wallet_address, decision.action, {
          reason: decision.reason, amountUsd: Number(actual)/1e6,
          hfBefore: hf, hfAfter, txHash: hash, success: true,
        });
        await saveMemory(user.wallet_address,
          `${decision.action}: $${(Number(actual)/1e6).toFixed(0)} repaid. HF ${hf.toFixed(2)}→${hfAfter.toFixed(2)}. ${decision.reason}`
        );
        await notifyUser(user.wallet_address, [
          `⚡ <b>Agent acted on your position</b>`,
          `Action: Repaid $${(Number(actual)/1e6).toFixed(0)} xUSDC`,
          `HF: ${hf.toFixed(2)} → ${hfAfter.toFixed(2)}`,
          `Reason: ${decision.reason}`,
          `<a href="https://testnet.arcscan.app/tx/${hash}">View TX ↗</a>`,
        ].join("\n"));

        const score = hfAfter > hf ? 95 : 20;
        await recordReputation("position_protected", score);
        console.log(`  ✓ ${user.wallet_address.slice(0,10)}... repaid $${(Number(actual)/1e6).toFixed(0)}, HF ${hf.toFixed(2)}→${hfAfter.toFixed(2)}`);
      } catch (e: any) {
        await logAction(user.wallet_address, decision.action, { reason: decision.reason, success: false, error: e.message?.slice(0,200) });
        console.error(`  ✗ ${user.wallet_address.slice(0,10)}...`, e.message?.slice(0,80));
      }
    }

    // ── Execute deploy yield ───────────────────────────────────────────────
    if (decision.action === "deploy_yield") {
      const idleBalance = walletBalance as bigint;
      const deployAmount = idleBalance < (approved as bigint) ? idleBalance : (approved as bigint);
      if (deployAmount < MIN_DEPLOY) continue;

      if (DRY_RUN) {
        console.log(`  [DRY_RUN] Would deployToYield ${user.wallet_address.slice(0,10)}... $${(Number(deployAmount)/1e6).toFixed(0)}`);
        continue;
      }

      try {
        const hash = await deployerWallet.writeContract({
          address:      ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR,
          abi:          EXECUTOR_ABI,
          functionName: "deployToYield",
          args:         [user.wallet_address as `0x${string}`, deployAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash });

        await logAction(user.wallet_address, "deploy_yield", {
          reason: decision.reason, amountUsd: Number(deployAmount)/1e6,
          hfBefore: hf, hfAfter: hf, txHash: hash, success: true,
        });
        await saveMemory(user.wallet_address,
          `deploy_yield: $${(Number(deployAmount)/1e6).toFixed(0)} deployed to pool. ${decision.reason}`
        );
        await notifyUser(user.wallet_address, [
          `📈 <b>Agent deployed xUSDC to yield</b>`,
          `Amount: $${(Number(deployAmount)/1e6).toFixed(0)} xUSDC`,
          `Reason: ${decision.reason}`,
          `<a href="https://testnet.arcscan.app/tx/${hash}">View TX ↗</a>`,
        ].join("\n"));

        await recordReputation("yield_deployed", 80);
        console.log(`  ✓ ${user.wallet_address.slice(0,10)}... deployed $${(Number(deployAmount)/1e6).toFixed(0)} to yield`);
      } catch (e: any) {
        await logAction(user.wallet_address, "deploy_yield", { reason: decision.reason, success: false, error: e.message?.slice(0,200) });
        console.error(`  ✗ deployToYield ${user.wallet_address.slice(0,10)}...`, e.message?.slice(0,80));
      }
    }
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

console.log(`Personal Agent starting... DRY_RUN=${DRY_RUN}`);
console.log(`Agent ID: #${AGENT_IDS.PERSONAL_AGENT}`);
console.log(`AgentExecutor: ${ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR}`);

let blockCount = 0;
publicClient.watchBlocks({
  onBlock: async () => {
    blockCount++;
    if (blockCount % 20 !== 0) return; // check every 20 blocks (~10s)
    if (isRunning) return;
    isRunning = true;
    try {
      await runCycle();
    } catch (e: any) {
      console.error("Cycle error:", e.message?.slice(0, 100));
    } finally {
      isRunning = false;
    }
  },
  onError: (e: Error) => console.error("Block watch error:", e.message),
});
