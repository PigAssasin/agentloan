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
  console.log(`   Execution: ${isCircleEnabled() ? "Circle SCA (gas sponsored, no private key)" : "Private key wallet"}`);
  console.log(`   Started: ${new Date().toISOString()}`);

  const botAddr = await getBotBalanceAddress();
  console.log(`   Wallet:  ${botAddr}\n`);

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

        // ── Step 1.5: Auto-refill gas if low — only needed for private key wallet
        // Circle Gas Station handles gas automatically when Circle is enabled
        if (!isCircleEnabled()) await checkAndRefill(botAddr);

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

        // ── Step 4: Liquidate + notify (Circle SCA or private key) ────────
        for (const pos of liquidatable) {
          const txHash = await executeWithStrategy(pos, botAddr as `0x${string}`);
          if (txHash) {
            // Fetch plan details for notification (plan was computed inside executeWithStrategy)
            console.log(`\n  Liquidated ${pos.address} | TX: ${txHash}`);
            await notify(liquidationMessage(
              pos.address,
              formatUnits(pos.totalDebtUSD / 2n, 18), // approx 50% of debt
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
