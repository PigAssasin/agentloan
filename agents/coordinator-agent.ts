/**
 * AgentLoan Coordinator Agent
 *
 * Runs every 30s. Calls Gemini ONLY when risky positions (HF < 1.1) exist.
 * Writes priority decisions to agents/state/coordinator.json.
 * Liquidation bot reads this file before executing.
 *
 * LLM stack: Gemini 2.0 Flash (free, primary) → DeepSeek V3 (fallback)
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import * as fs   from "fs";
import * as path from "path";
import { formatUnits } from "viem";
import { publicClient, getPositionsBatch } from "./lib/pool-reader";
import { callLLM } from "./lib/gemini-client";
import {
  loadMemory, saveMemory, addDecision,
  formatMemoryForPrompt, type MemoryEntry,
} from "./lib/coordinator-memory";
import { BOT_CONFIG } from "./config";

const COORDINATOR_FILE     = "agents/state/coordinator.json";
const KNOWN_BORROWERS_FILE = "agents/state/known-borrowers.json";
const SCAN_INTERVAL_MS     = 30_000;
const HF_RISK_THRESHOLD    = 1.1;
const WAD                  = 10n ** 18n;
const TOP_N_FOR_AI         = 10;   // only top 10 most urgent get AI reasoning
const MIN_LLM_INTERVAL_MS  = 5 * 60_000; // 5 minutes minimum between calls

// Track triggers
let lastBtcPrice = 0;
const seenCritical = new Set<string>(); // addresses that crossed 1.05

export interface CoordinatorDecision {
  timestamp: number;
  priority:  string[];   // borrower addresses in order
  skip:      string[];   // positions to skip this round
  strategy:  string;
  reasoning: string;
  model:     string;
}

function writeDecision(decision: CoordinatorDecision): void {
  const file = path.resolve(COORDINATOR_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(decision, null, 2), "utf8");
}

function buildPrompt(
  positions: Array<{ address: string; hf: number; debtUSD: number; bonusUSD: number; collateral: string }>,
  botBalanceUSDC: number,
  memoryContext: string,
): string {
  const posLines = positions
    .map((p, i) => `  ${String.fromCharCode(65 + i)}. ${p.address.slice(0, 10)}... HF=${p.hf.toFixed(3)} debt=$${p.debtUSD.toFixed(0)} bonus=$${p.bonusUSD.toFixed(0)} collateral=${p.collateral}`)
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

function parseDecision(text: string, fallbackPriority: string[]): Pick<CoordinatorDecision, "priority" | "skip" | "strategy" | "reasoning"> {
  // Strip thinking tags (Gemini 2.5 Flash adds these)
  const cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "");
  const start   = cleaned.indexOf("{");
  const end     = cleaned.lastIndexOf("}");
  const jsonStr = start !== -1 && end > start ? cleaned.slice(start, end + 1) : null;


  if (!jsonStr) {
    console.warn(`  [coordinator] no JSON found in response (len=${text.length})`);
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

async function runCoordinator(): Promise<void> {
  const knownBorrowers = new Set<`0x${string}`>();
  const memory = loadMemory();

  console.log("\n🧠 AgentLoan Coordinator Agent");
  console.log(`   LLM: Gemini 2.5 Flash (primary) → DeepSeek V3 (fallback)`);
  console.log(`   Trigger: only when positions HF < ${HF_RISK_THRESHOLD}`);
  console.log(`   Interval: ${SCAN_INTERVAL_MS / 1000}s\n`);

  console.log(`  Reading borrowers from bot's shared state...`);

  async function tick(): Promise<void> {
    try {
      // Read borrowers written by liquidation bot — no blockchain scanning, no conflict
      const borrowersFile = path.resolve(KNOWN_BORROWERS_FILE);
      if (fs.existsSync(borrowersFile)) {
        const list: string[] = JSON.parse(fs.readFileSync(borrowersFile, "utf8"));
        for (const b of list) knownBorrowers.add(b as `0x${string}`);
      }

      if (knownBorrowers.size === 0) {
        process.stdout.write("·");
        return;
      }

      // Batch read all positions
      const allPositions = await getPositionsBatch(Array.from(knownBorrowers) as any[]);
      const MAX_HF = 2n ** 256n - 1n;

      // Filter: only positions with HF < 1.1 and actual debt
      const risky = allPositions.filter(p =>
        p.healthFactor < MAX_HF &&
        p.healthFactor < BigInt(Math.floor(HF_RISK_THRESHOLD * 1e18)) &&
        p.totalDebtUSD > 0n
      );

      if (risky.length === 0) {
        process.stdout.write("·");
        return;
      }

      // ── Scoring function for all positions (free, instant, scales to 1000+) ──
      const sorted = risky
        .map(p => {
          const hf      = Number(p.healthFactor) / 1e18;
          const debtUSD = Number(formatUnits(p.totalDebtUSD, 18));
          const bonus   = debtUSD * 0.025; // 5% on 50% close factor
          const urgency = hf < 1.0 ? 100 : hf < 1.02 ? 80 : hf < 1.05 ? 60 : 40;
          const score   = bonus * 0.4 + urgency * 0.6;
          return { ...p, hf, debtUSD, bonus, score };
        })
        .sort((a, b) => b.score - a.score);

      // ── Decide whether to call LLM ─────────────────────────────────────────
      // Trigger 1: New position crossed critical threshold (1.05 or 1.02)
      const newCritical = sorted.filter(p =>
        (p.hf < 1.05 || p.hf < 1.02) && !seenCritical.has(p.address)
      );
      newCritical.forEach(p => seenCritical.add(p.address));

      // Trigger 2: Oracle price changed >1.5% (market event)
      let btcPriceChanged = false;
      try {
        const priceRaw = await publicClient.readContract({
          address: BOT_CONFIG.PRICE_ORACLE as `0x${string}`,
          abi: [{ name: "getPrice", type: "function", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
          functionName: "getPrice",
          args: [BOT_CONFIG.TOKENS[2].address as `0x${string}`], // xclrBTC
        }) as bigint;
        const btcPrice = Number(priceRaw) / 1e18;
        if (lastBtcPrice > 0 && Math.abs(btcPrice - lastBtcPrice) / lastBtcPrice > 0.015) {
          btcPriceChanged = true;
        }
        lastBtcPrice = btcPrice;
      } catch {}

      const timeSinceLastCall = Date.now() - (JSON.parse(fs.existsSync(path.resolve(COORDINATOR_FILE)) ? fs.readFileSync(path.resolve(COORDINATOR_FILE), "utf8") : "{}").timestamp ?? 0);
      const shouldCallAI = (newCritical.length > 0 || btcPriceChanged) && timeSinceLastCall > MIN_LLM_INTERVAL_MS;

      if (!shouldCallAI) {
        // Write scoring-based decision without AI
        const fallbackDecision: CoordinatorDecision = {
          timestamp: Date.now(),
          model: "scoring-function",
          priority: sorted.map(p => p.address),
          skip: [],
          strategy: `Score-based: top urgency ${sorted[0]?.hf.toFixed(3) ?? "?"} HF`,
          reasoning: `${risky.length} positions ranked by profit×urgency score. No LLM needed.`,
        };
        writeDecision(fallbackDecision);
        process.stdout.write("s"); // scoring
        return;
      }

      // ── AI reasoning — only top 10 most urgent ────────────────────────────
      const top10 = sorted.slice(0, TOP_N_FOR_AI);
      console.log(`\n  [coordinator] ${risky.length} positions (${newCritical.length} new critical, btcChange=${btcPriceChanged}) — calling AI for top ${top10.length}...`);

      const formatted = top10.map(p => ({
        address:    p.address,
        hf:         p.hf,
        debtUSD:    p.debtUSD,
        bonusUSD:   p.bonus,
        collateral: "mixed",
      }));

      // Get bot balance (approximate from env or default)
      const botBalanceUSDC = 50_000;  // conservative estimate

      const prompt = buildPrompt(formatted, botBalanceUSDC, formatMemoryForPrompt(memory));

      // Call LLM
      const { text, model } = await callLLM(prompt);
      const fallbackOrder = sorted.map(p => p.address);

      const parsed = parseDecision(text, fallbackOrder);

      const decision: CoordinatorDecision = {
        timestamp: Date.now(),
        model,
        ...parsed,
      };

      writeDecision(decision);

      // Merge AI top-10 priority with scoring order for positions 11+
      const aiAddresses = new Set(decision.priority.map(a => a.toLowerCase()));
      const rest = sorted.filter(p => !aiAddresses.has(p.address.toLowerCase())).map(p => p.address);
      decision.priority = [...decision.priority, ...rest];

      // Save to memory
      const newMem = addDecision(memory, {
        ts:        decision.timestamp,
        positions: formatted.map(p => ({ address: p.address, hf: p.hf, debtUSD: p.debtUSD, bonus: p.bonusUSD })),
        priority:  decision.priority,
        model,
      });
      saveMemory(newMem);

      console.log(`  [coordinator] Decision (${model}):`);
      console.log(`    Priority: ${decision.priority.slice(0, 3).map(a => a.slice(0, 10)).join(" → ")}`);
      console.log(`    Strategy: ${decision.strategy}`);
      console.log(`    Reason:   ${decision.reasoning}`);

    } catch (e: any) {
      console.warn(`  [coordinator] Error: ${e.message}`);
    }
  }

  // Run immediately then every 30s
  await tick();
  setInterval(tick, SCAN_INTERVAL_MS);
}

runCoordinator().catch(console.error);
