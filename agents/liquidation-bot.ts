/**
 * AgentLoan Liquidation Bot
 *
 * Architecture (single loop, no nonce conflicts):
 *   watchBlocks (~0.48s per block)
 *     └─ isRunning guard (skip if previous iteration still in progress)
 *         ├─ Every 20 blocks: scan for new borrowers (incremental, saves last-block.txt)
 *         ├─ If oracle stale (>15s): update Pyth prices (await confirmation + 10s timeout)
 *         ├─ Batch-read HF for all borrowers via Multicall3 (1 RPC call regardless of N)
 *         └─ Liquidate positions with HF < 1.0
 *
 * Effective reaction time: ~15s (oracle staleness threshold)
 *
 * Execution strategy (auto-detected):
 *   CIRCLE_WALLET_ID set → liquidations via Circle SCA (no private key needed, gas sponsored)
 *   BOT_PRIVATE_KEY only → liquidations via raw private key (existing behavior, unchanged)
 *   Both set             → Circle takes priority, private key as fallback
 *
 * Env vars (.env.local on VPS):
 *   BOT_PRIVATE_KEY       — existing bot wallet (still needed for oracle updates)
 *   CIRCLE_API_KEY        — Circle developer API key
 *   CIRCLE_ENTITY_SECRET  — Circle entity secret (registered in console.circle.com)
 *   CIRCLE_WALLET_ID      — Circle SCA wallet ID (from npm run agent:circle-setup)
 *   CIRCLE_BOT_ADDRESS    — Circle wallet address (for balance checks)
 *   NEXT_PUBLIC_ARC_RPC   — Arc Testnet RPC
 *   POOL_START_BLOCK      — LendingPool deploy block (testnet.arcscan.app)
 *   DRY_RUN               — "true" to log without sending txs
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { formatUnits }    from "viem";
import { BOT_CONFIG } from "./config";
import {
  publicClient,
  getAllBorrowers,
  getPositionsBatch,
  filterLiquidatable,
  isOracleStale,
} from "./lib/pool-reader";
import { createBotWallet, estimatePlan, executeLiquidation } from "./lib/liquidator";
import { updateOraclePrices }          from "./lib/oracle-updater";
import { notify, liquidationMessage }  from "./lib/notifier";
import { checkAndRefill }              from "./lib/auto-refill";
import { isCircleEnabled, executeWithStrategy, getBotBalanceAddress } from "./lib/execute-strategy";
import { createLiquidationJob, submitLiquidationProof, closeJob, getJobId } from "./lib/job-manager";
import { fetchSignals } from "./lib/signal-client";
import * as fs   from "fs";
import * as path from "path";
import type { UserPosition } from "./lib/pool-reader";

const COORDINATOR_FILE   = "agents/state/coordinator.json";
const COORDINATOR_MAX_AGE_MS = 2 * 60 * 1000;  // 2 minutes — stale = ignore

function applyCoordinatorPriority(positions: UserPosition[]): UserPosition[] {
  try {
    const file = path.resolve(COORDINATOR_FILE);
    if (!fs.existsSync(file)) return positions;

    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data?.priority || !data?.timestamp) return positions;

    // Ignore stale decisions (coordinator may be down)
    if (Date.now() - data.timestamp > COORDINATOR_MAX_AGE_MS) return positions;

    const priority: string[] = data.priority.map((a: string) => a.toLowerCase());
    const skip: string[]     = (data.skip ?? []).map((a: string) => a.toLowerCase());

    // Remove skipped positions, then sort by coordinator order
    return positions
      .filter(p => !skip.includes(p.address.toLowerCase()))
      .sort((a, b) => {
        const ia = priority.indexOf(a.address.toLowerCase());
        const ib = priority.indexOf(b.address.toLowerCase());
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
  } catch {
    return positions;  // always fall back to original order
  }
}

// Wrap oracle update with timeout — prevents bot from hanging if tx stalls
async function safeUpdateOracle(wallet: ReturnType<typeof createBotWallet>): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timed out")), BOT_CONFIG.PRICE_UPDATE_TIMEOUT_MS)
  );
  try {
    await Promise.race([updateOraclePrices(wallet), timeout]);
    process.stdout.write(" [oracle ✓]");
  } catch (e: any) {
    process.stdout.write(` [oracle skip: ${e.message}]`);
  }
}

async function main() {
  console.log(`\n🤖 AgentLoan Liquidation Bot`);
  console.log(`   Mode:    ${BOT_CONFIG.DRY_RUN ? "DRY_RUN (no txs)" : "LIVE"}`);
  console.log(`   Execution: ${isCircleEnabled() ? "Circle SCA (gas sponsored, no private key)" : "Private key wallet"}`);
  console.log(`   Started: ${new Date().toISOString()}`);

  const botAddr    = await getBotBalanceAddress();
  const signalUrl  = process.env.SIGNAL_AGENT_URL ?? "http://localhost:3001";
  console.log(`   Wallet:  ${botAddr}`);
  console.log(`   Signals: ${signalUrl}\n`);

  // Keep private key wallet for oracle updates (needs native USDC for Pyth fee)
  const pkWallet = (() => {
    try { return createBotWallet(); } catch { return null; }
  })();

  // Accumulates known borrowers across all runs
  const knownBorrowers = new Set<`0x${string}`>();

  let isRunning  = false;
  let blockCount = 0;

  publicClient.watchBlocks({
    onBlock: async (block) => {
      if (isRunning) return;  // concurrency guard
      isRunning = true;
      blockCount++;

      try {
        // ── Step 1: Scan for new borrowers every 20 blocks (~10s) ──────────
        if (blockCount % 20 === 1) {
          const fresh = await getAllBorrowers();
          for (const b of fresh) knownBorrowers.add(b as `0x${string}`);
          if (fresh.length > 0) {
            console.log(`\n  [block ${block.number}] +${fresh.length} borrower(s), total: ${knownBorrowers.size}`);
          }
        }

        if (knownBorrowers.size === 0) {
          process.stdout.write("·");
          return;
        }

        // ── Step 1.5: Auto-refill gas (private key wallet only)
        if (!isCircleEnabled()) await checkAndRefill(botAddr);

        // ── Step 1.6: Priority signals from Signal Agent (best-effort) ────
        // 3x faster scan than Multicall3 — 15-30s head start on liquidations
        // Falls back silently if Signal Agent is offline or payment fails
        if (pkWallet && blockCount % 4 === 1) {
          try {
            const signals = await fetchSignals(pkWallet);
            if (signals.length > 0) {
              const WAD = 10n ** 18n;
              const priorityPos = signals
                .filter(s => parseFloat(s.healthFactor) < 1.0)
                .map(s => ({
                  address:            s.borrower as `0x${string}`,
                  healthFactor:       BigInt(Math.floor(parseFloat(s.healthFactor) * 1e18)),
                  totalDebtUSD:       BigInt(Math.floor(parseFloat(s.totalDebtUSD) * 1e18)),
                  totalCollateralUSD: 0n,
                }));
              if (priorityPos.length > 0) {
                console.log(`\n  ⚡ [block ${block.number}] ${priorityPos.length} priority signal(s)`);
                for (const pos of priorityPos) {
                  const txHash = await executeWithStrategy(pos, botAddr as `0x${string}`);
                  if (txHash) {
                    const jobId = getJobId(pos.address);
                    if (jobId !== null && pkWallet) {
                      await submitLiquidationProof(jobId, txHash as `0x${string}`, pkWallet).catch(() => {});
                      closeJob(pos.address);
                    }
                    await notify(liquidationMessage(pos.address, formatUnits(pos.totalDebtUSD / 2n, 18), BOT_CONFIG.DEBT_TOKEN, txHash));
                  }
                }
              }
            }
          } catch { /* silent — fallback to Multicall3 below */ }
        }

        // ── Step 2: Update oracle if stale ─────────────────────────────────
        // Oracle update uses private key wallet (needs native USDC for Pyth fee)
        // Falls back gracefully if no private key available
        const stale = await isOracleStale();
        if (stale) {
          process.stdout.write(`\n  [block ${block.number}] oracle stale, updating...`);
          if (!BOT_CONFIG.DRY_RUN && pkWallet) await safeUpdateOracle(pkWallet);
          else process.stdout.write(BOT_CONFIG.DRY_RUN ? " [DRY_RUN skip]" : " [no pk wallet]");
          process.stdout.write("\n");
        }

        // ── Step 3: Batch HF read via Multicall3 (1 RPC call) ──────────────
        const all          = await getPositionsBatch(Array.from(knownBorrowers));
        const liquidatable = filterLiquidatable(all);

        if (liquidatable.length === 0) {
          process.stdout.write("·");
          return;
        }

        console.log(`\n  [block ${block.number}] ${liquidatable.length} liquidatable position(s)`);

        // ── Step 3.5: Register on ERC-8183 (best-effort, never blocks) ────
        if (pkWallet) {
          for (const pos of liquidatable) {
            await createLiquidationJob(pos.address, pkWallet).catch(() => {});
          }
        }

        // ── Step 4: Sort by coordinator priority (if available + fresh) ──
        const sorted = applyCoordinatorPriority(liquidatable);
        if (sorted[0]?.address !== liquidatable[0]?.address) {
          console.log(`  [coordinator] reordered: ${sorted.map(p => p.address.slice(0,8)).join(" → ")}`);
        }

        // ── Step 5: Liquidate + notify (Circle SCA or private key) ────────
        for (const pos of sorted) {
          const txHash = await executeWithStrategy(pos, botAddr as `0x${string}`);
          if (txHash) {
            console.log(`\n  Liquidated ${pos.address} | TX: ${txHash}`);
            // Submit ERC-8183 proof (best-effort)
            const jobId = getJobId(pos.address);
            if (jobId !== null && pkWallet) {
              await submitLiquidationProof(jobId, txHash as `0x${string}`, pkWallet).catch(() => {});
              closeJob(pos.address);
            }
            await notify(liquidationMessage(
              pos.address,
              formatUnits(pos.totalDebtUSD / 2n, 18),
              BOT_CONFIG.DEBT_TOKEN,
              txHash,
            ));
          }
        }

      } catch (e: any) {
        console.error(`\n  Error at block ${block.number}:`, e.message);
      } finally {
        isRunning = false;
      }
    },

    onError: (err) => console.error("\nwatchBlocks error:", err.message),
  });

  // Keep process alive indefinitely (PM2 manages restarts)
  await new Promise(() => {});
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
