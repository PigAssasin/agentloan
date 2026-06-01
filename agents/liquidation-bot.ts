/**
 * ArcBank Liquidation Bot
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
 * Env vars (.env.local on VPS):
 *   BOT_PRIVATE_KEY     — dedicated bot wallet (NOT deployer)
 *   NEXT_PUBLIC_ARC_RPC — Arc Testnet RPC
 *   POOL_START_BLOCK    — LendingPool deploy block (testnet.arcscan.app)
 *   DRY_RUN             — "true" to log without sending txs
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
import { updateOraclePrices } from "./lib/oracle-updater";
import { notify, liquidationMessage } from "./lib/notifier";
import { checkAndRefill }            from "./lib/auto-refill";

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
  console.log(`\n🤖 ArcBank Liquidation Bot`);
  console.log(`   Mode:    ${BOT_CONFIG.DRY_RUN ? "DRY_RUN (no txs)" : "LIVE"}`);
  console.log(`   Started: ${new Date().toISOString()}`);

  const wallet  = createBotWallet();
  const botAddr = wallet.account!.address;
  console.log(`   Wallet:  ${botAddr}\n`);

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

        // ── Step 1.5: Auto-refill gas if low (<10 USDC → send 100 from deployer)
        await checkAndRefill(botAddr);

        // ── Step 2: Update oracle if stale ─────────────────────────────────
        const stale = await isOracleStale();
        if (stale) {
          process.stdout.write(`\n  [block ${block.number}] oracle stale, updating...`);
          if (!BOT_CONFIG.DRY_RUN) await safeUpdateOracle(wallet);
          else process.stdout.write(" [DRY_RUN skip]");
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

        // ── Step 4: Liquidate + notify ─────────────────────────────────────
        for (const pos of liquidatable) {
          const plan = await estimatePlan(pos, botAddr);
          if (!plan) continue;
          const txHash = await executeLiquidation(pos, plan, wallet);
          if (txHash) {
            await notify(liquidationMessage(
              pos.address,
              formatUnits(plan.debtAmount, 6),
              plan.collToken,
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
