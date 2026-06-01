import {
  createWalletClient, http,
  formatUnits, type Address, type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnetChain, BOT_CONFIG } from "../config";
import { publicClient }                from "./pool-reader";
import type { UserPosition }           from "./pool-reader";
import LendingPoolABI from "../../src/lib/abi-lending-pool.json";
import MockERC20ABI   from "../../src/lib/abi-mock-erc20.json";

export function createBotWallet(): WalletClient {
  const pk = process.env.BOT_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("BOT_PRIVATE_KEY not set in environment");
  return createWalletClient({
    account:   privateKeyToAccount(pk),
    chain:     arcTestnetChain,
    transport: http(BOT_CONFIG.RPC_URL),
  });
}

export interface LiquidationPlan {
  debtAmount: bigint;
  collToken:  Address;
}

// Returns null if: no debt, bot balance insufficient, or not profitable
export async function estimatePlan(
  position:   UserPosition,
  botAddress: Address,
): Promise<LiquidationPlan | null> {
  const debtToken = BOT_CONFIG.DEBT_TOKEN;

  const debtBal = await publicClient.readContract({
    address: BOT_CONFIG.LENDING_POOL, abi: LendingPoolABI as any,
    functionName: "getUserBorrowBalance",
    args: [debtToken, position.address],
  }) as bigint;
  if (debtBal === 0n) return null;

  // Close factor: max 50% per liquidation (matches contract)
  const repayAmount = debtBal / 2n === 0n ? debtBal : debtBal / 2n;

  // Bot must hold enough USDC to repay
  const botBalance = await publicClient.readContract({
    address: debtToken as Address, abi: MockERC20ABI as any,
    functionName: "balanceOf",
    args: [botAddress],
  }) as bigint;
  if (botBalance < repayAmount) {
    console.log(`  Insufficient bot balance: ${formatUnits(botBalance, 6)} < ${formatUnits(repayAmount, 6)} xUSDC`);
    return null;
  }

  // Find best collateral (largest borrower supply)
  let bestColl   = "" as Address;
  let bestSupply = 0n;
  for (const tok of BOT_CONFIG.TOKENS) {
    // Never use debt token as collateral — same token causes accounting corruption
    if (tok.address.toLowerCase() === debtToken.toLowerCase()) continue;
    const bal = await publicClient.readContract({
      address: BOT_CONFIG.LENDING_POOL, abi: LendingPoolABI as any,
      functionName: "getUserSupplyBalance",
      args: [tok.address as Address, position.address],
    }) as bigint;
    if (bal > bestSupply) { bestSupply = bal; bestColl = tok.address as Address; }
  }
  if (!bestColl || bestSupply === 0n) return null;

  // Profit check: 5% bonus on 50% of debt value > gas (~0.006 USDC/tx × 2 txs)
  const debtValueUSD   = Number(formatUnits(position.totalDebtUSD, 18));
  const bonusUSD       = debtValueUSD * 0.5 * 0.05;
  const gasEstimateUSD = 0.02; // approve + liquidate
  if (bonusUSD < gasEstimateUSD) {
    console.log(`  Not profitable: bonus $${bonusUSD.toFixed(4)} < gas $${gasEstimateUSD}`);
    return null;
  }

  return { debtAmount: repayAmount, collToken: bestColl };
}

// Execute liquidation. Returns tx hash or null (DRY_RUN).
export async function executeLiquidation(
  position: UserPosition,
  plan:     LiquidationPlan,
  wallet:   WalletClient,
): Promise<`0x${string}` | null> {
  const debtToken = BOT_CONFIG.DEBT_TOKEN as Address;

  console.log(`\n  Liquidating ${position.address}`);
  console.log(`    HF:    ${(Number(position.healthFactor) / 1e18).toFixed(4)}`);
  console.log(`    Repay: ${formatUnits(plan.debtAmount, 6)} xUSDC → Coll: ${plan.collToken}`);

  if (BOT_CONFIG.DRY_RUN) {
    console.log("    [DRY_RUN] skipped");
    return null;
  }

  // Approve exact amount (never MaxUint256)
  await wallet.writeContract({
    address: debtToken, abi: MockERC20ABI as any,
    functionName: "approve",
    args: [BOT_CONFIG.LENDING_POOL, plan.debtAmount],
  } as any);

  const hash = await wallet.writeContract({
    address: BOT_CONFIG.LENDING_POOL, abi: LendingPoolABI as any,
    functionName: "liquidate",
    args: [position.address, debtToken, plan.collToken, plan.debtAmount],
  } as any);

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`    ✅ ${hash}`);
  return hash;
}
