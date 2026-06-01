/**
 * Execution strategy selector — picks Circle SCA or private key wallet.
 *
 * Priority:
 *   1. CIRCLE_WALLET_ID set → use Circle Developer-Controlled Wallet (no private key needed)
 *   2. BOT_PRIVATE_KEY set  → use raw private key wallet (existing behavior, unchanged)
 *   3. Both set             → Circle wins
 *
 * Nothing is deleted. Both paths remain fully functional.
 */
import { formatUnits, type Address } from "viem";
import { BOT_CONFIG }                from "../config";
import { publicClient }              from "./pool-reader";
import type { UserPosition } from "./pool-reader";
import type { LiquidationPlan } from "./liquidator";
import { createBotWallet, estimatePlan, executeLiquidation } from "./liquidator";
import { liquidateViaCircle, approveViaCircle } from "./circle-wallet";
import LendingPoolABI from "../../src/lib/abi-lending-pool.json";
import MockERC20ABI   from "../../src/lib/abi-mock-erc20.json";

export function isCircleEnabled(): boolean {
  return !!process.env.CIRCLE_WALLET_ID && !!process.env.CIRCLE_API_KEY && !!process.env.CIRCLE_ENTITY_SECRET;
}

export function getBotAddress(): string {
  if (isCircleEnabled()) {
    return process.env.CIRCLE_BOT_ADDRESS ?? "Circle wallet (address unknown)";
  }
  // Private key path — derive address from key
  const pk = process.env.BOT_PRIVATE_KEY;
  if (!pk) throw new Error("Neither CIRCLE_WALLET_ID nor BOT_PRIVATE_KEY is set");
  const wallet = createBotWallet();
  return wallet.account!.address;
}

/**
 * Execute a liquidation using whichever strategy is available.
 * Circle path: no private key needed, gas sponsored by Circle Gas Station.
 * Fallback path: existing viem WalletClient with BOT_PRIVATE_KEY.
 */
export async function executeWithStrategy(
  position:    UserPosition,
  botAddress:  Address,
): Promise<string | null> {
  // Estimate plan — same logic regardless of execution strategy
  const plan = await estimatePlan(position, botAddress);
  if (!plan) return null;

  const debtToken = BOT_CONFIG.DEBT_TOKEN as string;

  if (BOT_CONFIG.DRY_RUN) {
    console.log(`    [DRY_RUN] Would liquidate ${position.address} via ${isCircleEnabled() ? "Circle SCA" : "private key"}`);
    return null;
  }

  if (isCircleEnabled()) {
    // ── Circle SCA path (no private key) ────────────────────────────────
    console.log(`    Executing via Circle SCA wallet (gas sponsored)`);
    try {
      const txId = await liquidateViaCircle(
        position.address,
        debtToken,
        plan.collToken,
        plan.debtAmount.toString(),
      );
      console.log(`    Circle TX ID: ${txId}`);
      return txId;
    } catch (e: any) {
      console.warn(`    Circle execution failed: ${e.message?.slice(0,80)} — falling back to private key`);
      // Fall through to private key path
    }
  }

  // ── Private key path (existing behavior, unchanged) ───────────────────
  const wallet = createBotWallet();
  return executeLiquidation(position, plan, wallet);
}

/**
 * Get bot address regardless of strategy.
 * Used for balance checks and profit estimation.
 */
export async function getBotBalanceAddress(): Promise<Address> {
  if (isCircleEnabled() && process.env.CIRCLE_BOT_ADDRESS) {
    return process.env.CIRCLE_BOT_ADDRESS as Address;
  }
  const wallet = createBotWallet();
  return wallet.account!.address;
}
