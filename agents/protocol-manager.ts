/**
 * AgentLoan Protocol Manager
 *
 * Replaces coordinator-agent process. Runs 3 loops in a single PM2 process:
 *   Loop A (15s)  — Oracle Keeper: push Pyth prices when stale
 *   Loop B (30s)  — Coordinator AI: rank risky positions for the bot
 *   Loop C (60s)  — Health Monitor: track utilization, oracle age, bot liveness
 *
 * Env vars (.env.local on VPS):
 *   BOT_PRIVATE_KEY           — wallet for oracle push (needs native USDC for Pyth fee)
 *   GEMINI_API_KEY            — primary LLM (Gemini 2.5 Flash)
 *   DEEPSEEK_API_KEY          — fallback LLM
 *   SUPABASE_URL              — metrics persistence
 *   SUPABASE_SERVICE_ROLE_KEY — metrics persistence
 */
import * as dotenv from "dotenv";
import * as path   from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import * as fs                  from "fs";
import { createWalletClient, http, parseAbi, formatUnits } from "viem";
import { privateKeyToAccount }  from "viem/accounts";
import { publicClient, getPositionsBatch, isOracleStale, readLastBlock } from "./lib/pool-reader";
import { updateOraclePrices }   from "./lib/oracle-updater";
import { notify }               from "./lib/notifier";
import { callLLM }              from "./lib/gemini-client";
import {
  loadMemory, saveMemory, addDecision, formatMemoryForPrompt,
} from "./lib/coordinator-memory";
import { BOT_CONFIG, arcTestnetChain } from "./config";
import { ARC_TESTNET_CONTRACTS }       from "../config/contracts";
import LendingPoolABI                  from "../src/lib/abi-lending-pool.json";

// ── Constants ─────────────────────────────────────────────────────────────────

const RAY = 10n ** 27n;

const ORACLE_INTERVAL_MS      = 15_000;
const COORDINATOR_INTERVAL_MS = 30_000;
const HEALTH_INTERVAL_MS      = 60_000;

const COORDINATOR_FILE     = "agents/state/coordinator.json";
const KNOWN_BORROWERS_FILE = "agents/state/known-borrowers.json";
const HEARTBEAT_FILE       = "agents/state/pm-heartbeat.json";

const HF_RISK_THRESHOLD   = 1.1;
const TOP_N_FOR_AI        = 10;
const MIN_LLM_INTERVAL_MS = 5 * 60_000;

const PYTH_ADDRESS = ARC_TESTNET_CONTRACTS.PYTH;
const PRICE_IDS = {
  BTC:  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  EUR:  "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};

// ── Oracle wallet (BOT_PRIVATE_KEY — same wallet as liquidation bot) ──────────

const pkWallet = (() => {
  const key = process.env.BOT_PRIVATE_KEY;
  if (!key) return null;
  try {
    const account = privateKeyToAccount(key as `0x${string}`);
    return createWalletClient({ account, chain: arcTestnetChain, transport: http() });
  } catch { return null; }
})();

// ── Coordinator state ─────────────────────────────────────────────────────────

let lastBtcPrice = 0;
const seenCritical   = new Set<string>();
const knownBorrowers = new Set<`0x${string}`>();
const memory         = loadMemory();

export interface CoordinatorDecision {
  timestamp: number;
  priority:  string[];
  skip:      string[];
  strategy:  string;
  reasoning: string;
  model:     string;
}

function writeDecision(decision: CoordinatorDecision): void {
  const file = path.resolve(COORDINATOR_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(decision, null, 2), "utf8");
}

function buildCoordinatorPrompt(
  positions: Array<{ address: string; hf: number; debtUSD: number; bonusUSD: number; collateral: string }>,
  botBalanceUSDC: number,
  memoryContext: string,
): string {
  const posLines = positions
    .map((p, i) =>
      `  ${String.fromCharCode(65 + i)}. ${p.address.slice(0, 10)}... HF=${p.hf.toFixed(3)} debt=$${p.debtUSD.toFixed(0)} bonus=$${p.bonusUSD.toFixed(0)} collateral=${p.collateral}`
    )
    .join("\n");

  return `You are a DeFi liquidation coordinator agent on Arc Testnet (AgentLoan protocol).

CURRENT RISKY POSITIONS (HF < 1.1):
${posLines}

BOT STATE:
- Available USDC: $${botBalanceUSDC.toFixed(0)}
- Gas cost: ~$0.006 per tx

${memoryContext}

TASK: Decide liquidation priority. Consider:
1. Urgency (lower HF = more urgent, risk of being front-run)
2. Profit (higher bonus = better)
3. Capital efficiency (can bot afford it?)
4. Front-run risk (large positions attract other bots)

Respond ONLY with valid JSON:
{
  "priority": ["0xADDRESS1", "0xADDRESS2"],
  "skip": [],
  "strategy": "one_sentence_strategy",
  "reasoning": "two_sentences_max"
}`;
}

function parseDecision(
  text: string,
  fallbackPriority: string[],
): Pick<CoordinatorDecision, "priority" | "skip" | "strategy" | "reasoning"> {
  const cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
  const start   = cleaned.indexOf("{");
  const end     = cleaned.lastIndexOf("}");
  const jsonStr = start !== -1 && end > start ? cleaned.slice(start, end + 1) : null;

  if (!jsonStr) {
    console.warn(`  [coordinator] no JSON in response (len=${text.length})`);
    return { priority: fallbackPriority, skip: [], strategy: "fallback_rule_based", reasoning: "no JSON in response" };
  }
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      priority:  Array.isArray(parsed.priority)  ? parsed.priority  : fallbackPriority,
      skip:      Array.isArray(parsed.skip)       ? parsed.skip      : [],
      strategy:  parsed.strategy  ?? "llm_decided",
      reasoning: parsed.reasoning ?? "",
    };
  } catch (e: any) {
    console.warn(`  [coordinator] JSON.parse failed: ${e.message}`);
    return { priority: fallbackPriority, skip: [], strategy: "fallback_rule_based", reasoning: "LLM parse failed" };
  }
}

// ── Loop A: Oracle Keeper ─────────────────────────────────────────────────────

async function runOracleKeeper(): Promise<void> {
  try {
    const stale = await isOracleStale();
    if (stale) {
      if (!pkWallet) {
        console.warn("  [oracle] stale but BOT_PRIVATE_KEY not set — cannot push");
        return;
      }
      await updateOraclePrices(pkWallet);
      console.log(`  [oracle] pushed at ${new Date().toISOString()}`);
    }

    // Write heartbeat (health monitor reads this to know PM is alive)
    const heartbeatPath = path.resolve(HEARTBEAT_FILE);
    fs.mkdirSync(path.dirname(heartbeatPath), { recursive: true });
    fs.writeFileSync(heartbeatPath, JSON.stringify({ ts: Date.now(), alive: true }));
  } catch (e: any) {
    console.error("  [oracle] FAILED:", e.message?.slice(0, 80));
    notify(`⚠️ Protocol Manager oracle push failed: ${e.message?.slice(0, 80)}`).catch(() => {});
  }
}

// ── Loop B: Coordinator AI ────────────────────────────────────────────────────

async function runCoordinator(): Promise<void> {
  try {
    // Read borrowers discovered by liquidation bot (shared state file)
    const borrowersFile = path.resolve(KNOWN_BORROWERS_FILE);
    if (fs.existsSync(borrowersFile)) {
      const list: string[] = JSON.parse(fs.readFileSync(borrowersFile, "utf8"));
      for (const b of list) knownBorrowers.add(b as `0x${string}`);
    }

    if (knownBorrowers.size === 0) { process.stdout.write("·"); return; }

    const allPositions = await getPositionsBatch(Array.from(knownBorrowers) as any[]);
    const MAX_HF       = 2n ** 256n - 1n;

    const risky = allPositions.filter(p =>
      p.healthFactor < MAX_HF &&
      p.healthFactor < BigInt(Math.floor(HF_RISK_THRESHOLD * 1e18)) &&
      p.totalDebtUSD > 0n
    );

    if (risky.length === 0) { process.stdout.write("·"); return; }

    const sorted = risky
      .map(p => {
        const hf      = Number(p.healthFactor) / 1e18;
        const debtUSD = Number(formatUnits(p.totalDebtUSD, 18));
        const bonus   = debtUSD * 0.025;
        const urgency = hf < 1.0 ? 100 : hf < 1.02 ? 80 : hf < 1.05 ? 60 : 40;
        return { ...p, hf, debtUSD, bonus, score: bonus * 0.4 + urgency * 0.6 };
      })
      .sort((a, b) => b.score - a.score);

    // LLM trigger 1: new position crossed critical threshold
    const newCritical = sorted.filter(p =>
      (p.hf < 1.05 || p.hf < 1.02) && !seenCritical.has(p.address)
    );
    newCritical.forEach(p => seenCritical.add(p.address));

    // LLM trigger 2: BTC price moved >1.5%
    let btcPriceChanged = false;
    try {
      const priceRaw = await publicClient.readContract({
        address: BOT_CONFIG.PRICE_ORACLE as `0x${string}`,
        abi: [{
          name: "getPrice", type: "function", stateMutability: "view",
          inputs: [{ name: "token", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        }] as const,
        functionName: "getPrice",
        args: [BOT_CONFIG.TOKENS[2].address as `0x${string}`],
      }) as bigint;
      const btcPrice = Number(priceRaw) / 1e18;
      if (lastBtcPrice > 0 && Math.abs(btcPrice - lastBtcPrice) / lastBtcPrice > 0.015) {
        btcPriceChanged = true;
      }
      lastBtcPrice = btcPrice;
    } catch {}

    const lastDecisionTs = (() => {
      try {
        const file = path.resolve(COORDINATOR_FILE);
        return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")).timestamp ?? 0) : 0;
      } catch { return 0; }
    })();
    const shouldCallAI = (newCritical.length > 0 || btcPriceChanged) &&
      (Date.now() - lastDecisionTs) > MIN_LLM_INTERVAL_MS;

    if (!shouldCallAI) {
      writeDecision({
        timestamp: Date.now(),
        model:     "scoring-function",
        priority:  sorted.map(p => p.address),
        skip:      [],
        strategy:  `Score-based: top urgency ${sorted[0]?.hf.toFixed(3) ?? "?"} HF`,
        reasoning: `${risky.length} positions ranked by profit×urgency score.`,
      });
      process.stdout.write("s");
      return;
    }

    const top10     = sorted.slice(0, TOP_N_FOR_AI);
    console.log(`\n  [coordinator] ${risky.length} positions (${newCritical.length} new critical, btcChange=${btcPriceChanged}) — calling AI...`);

    const formatted = top10.map(p => ({
      address: p.address, hf: p.hf, debtUSD: p.debtUSD, bonusUSD: p.bonus, collateral: "mixed",
    }));

    const { text, model } = await callLLM(buildCoordinatorPrompt(formatted, 50_000, formatMemoryForPrompt(memory)));
    const parsed          = parseDecision(text, sorted.map(p => p.address));
    const decision: CoordinatorDecision = { timestamp: Date.now(), model, ...parsed };

    // Append positions 11+ (not in AI top-10) to end of priority list
    const aiSet = new Set(decision.priority.map(a => a.toLowerCase()));
    decision.priority = [
      ...decision.priority,
      ...sorted.filter(p => !aiSet.has(p.address.toLowerCase())).map(p => p.address),
    ];

    writeDecision(decision);
    saveMemory(addDecision(memory, {
      ts:        decision.timestamp,
      positions: formatted.map(p => ({ address: p.address, hf: p.hf, debtUSD: p.debtUSD, bonus: p.bonusUSD })),
      priority:  decision.priority,
      model,
    }));

    console.log(`  [coordinator] Decision (${model}):`);
    console.log(`    Priority: ${decision.priority.slice(0, 3).map(a => a.slice(0, 10)).join(" → ")}`);
    console.log(`    Strategy: ${decision.strategy}`);
    console.log(`    Reason:   ${decision.reasoning}`);

  } catch (e: any) {
    console.warn(`  [coordinator] Error: ${e.message}`);
  }
}

// ── Loop C: Health Monitor ────────────────────────────────────────────────────

const PYTH_ABI = parseAbi([
  "function getPriceUnsafe(bytes32 id) external view returns (int64 price, uint64 conf, int32 expo, uint publishTime)",
]);

async function getOracleAgeSeconds(priceId: string): Promise<number> {
  try {
    // Pyth returns a struct decoded as a tuple — access publishTime by index [3]
    const result = await publicClient.readContract({
      address:      PYTH_ADDRESS,
      abi:          PYTH_ABI,
      functionName: "getPriceUnsafe",
      args:         [priceId as `0x${string}`],
    }) as unknown as [bigint, bigint, bigint, bigint]; // [price, conf, expo, publishTime]
    return Math.max(0, Math.floor(Date.now() / 1000) - Number(result[3]));
  } catch {
    return 9999;
  }
}

// Uses LendingPoolABI (named struct fields) — avoids index-based tuple access bugs
type ReserveData = {
  liquidityIndex:    bigint;
  borrowIndex:       bigint;
  totalScaledSupply: bigint;
  totalScaledBorrow: bigint;
};

async function getReserveUtil(tokenAddress: `0x${string}`): Promise<number> {
  const r = await publicClient.readContract({
    address:      ARC_TESTNET_CONTRACTS.LENDING_POOL,
    abi:          LendingPoolABI as any,
    functionName: "getReserveData",
    args:         [tokenAddress],
  }) as ReserveData;

  const supply = (r.totalScaledSupply * r.liquidityIndex) / RAY;
  const borrow = (r.totalScaledBorrow * r.borrowIndex)    / RAY;
  return supply > 0n ? Number(borrow) / Number(supply) : 0;
}

async function runHealthMonitor(): Promise<void> {
  try {
    const [usdcUtil, eurcUtil, btcUtil] = await Promise.all([
      getReserveUtil(ARC_TESTNET_CONTRACTS.X_USDC),
      getReserveUtil(ARC_TESTNET_CONTRACTS.X_EURC),
      getReserveUtil(ARC_TESTNET_CONTRACTS.X_CLR_BTC),
    ]);

    const [btcAge, eurAge, usdcAge] = await Promise.all([
      getOracleAgeSeconds(PRICE_IDS.BTC),
      getOracleAgeSeconds(PRICE_IDS.EUR),
      getOracleAgeSeconds(PRICE_IDS.USDC),
    ]);

    const lastBlock    = readLastBlock();
    const currentBlock = await publicClient.getBlockNumber();
    const botAlive     = (currentBlock - lastBlock) < 200n;

    // Persist metrics to Supabase (fire-and-forget)
    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (SB_URL && SB_KEY) {
      fetch(`${SB_URL}/rest/v1/protocol_metrics`, {
        method:  "POST",
        headers: {
          "apikey":        SB_KEY,
          "Authorization": `Bearer ${SB_KEY}`,
          "Content-Type":  "application/json",
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify({
          usdc_utilization:   usdcUtil,
          eurc_utilization:   eurcUtil,
          btc_utilization:    btcUtil,
          btc_pyth_age_sec:   btcAge,
          eur_pyth_age_sec:   eurAge,
          usdc_pyth_age_sec:  usdcAge,
          bot_last_block:     Number(lastBlock),
          bot_alive:          botAlive,
          total_bad_debt_usd: 0,
          liquidatable_count: 0,
          recorded_at:        new Date().toISOString(),
        }),
      }).catch(() => {});
    }

    // Rule-based alerts
    if (btcAge > 120)
      notify(`⚠️ BTC oracle stale ${btcAge}s — check Protocol Manager`).catch(() => {});
    if (usdcUtil > 0.90)
      notify(`⚠️ xUSDC utilization ${(usdcUtil * 100).toFixed(1)}% — near borrow cap`).catch(() => {});
    if (!botAlive)
      notify(`🚨 Liquidation bot appears offline (last block ${Number(lastBlock)}, current ${currentBlock})`).catch(() => {});

    console.log(
      `  [health] USDC=${(usdcUtil * 100).toFixed(1)}%` +
      ` EURC=${(eurcUtil * 100).toFixed(1)}%` +
      ` BTC=${(btcUtil * 100).toFixed(1)}%` +
      ` | oracle BTC=${btcAge}s EUR=${eurAge}s USDC=${usdcAge}s` +
      ` | bot=${botAlive ? "alive ✓" : "OFFLINE ✗"}`
    );
  } catch (e: any) {
    console.error("  [health] Error:", e.message?.slice(0, 80));
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

console.log("\n🛡️  AgentLoan Protocol Manager");
console.log(`   Loop A (Oracle):      every ${ORACLE_INTERVAL_MS / 1000}s`);
console.log(`   Loop B (Coordinator): every ${COORDINATOR_INTERVAL_MS / 1000}s`);
console.log(`   Loop C (Health):      every ${HEALTH_INTERVAL_MS / 1000}s`);
console.log(`   Oracle wallet: ${pkWallet ? "configured ✓" : "MISSING — set BOT_PRIVATE_KEY"}`);
console.log(`   Started: ${new Date().toISOString()}\n`);

// Run all loops immediately on start, then on interval
runOracleKeeper().catch(console.error);
runCoordinator().catch(console.error);
runHealthMonitor().catch(console.error);

setInterval(() => runOracleKeeper().catch(console.error), ORACLE_INTERVAL_MS);
setInterval(() => runCoordinator().catch(console.error), COORDINATOR_INTERVAL_MS);
setInterval(() => runHealthMonitor().catch(console.error), HEALTH_INTERVAL_MS);
