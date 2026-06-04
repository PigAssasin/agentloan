// Auto-refill bot wallet with USDC (native gas token) from deployer when low.
// Transfers 100 USDC once when bot balance drops below LOW_THRESHOLD.
// Requires DEPLOYER_PRIVATE_KEY in .env.local.

import { createWalletClient, http, formatUnits, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnetChain, BOT_CONFIG } from "../config";
import { publicClient } from "./pool-reader";

// Arc native USDC uses 18 decimals (dual-interface: native=18dec, ERC20=6dec)
const LOW_THRESHOLD  = parseUnits("10",  18); // refill when < 10 USDC native
const REFILL_AMOUNT  = parseUnits("100", 18); // send 100 USDC native each time

export async function checkAndRefill(botAddress: Address): Promise<void> {
  const deployerPk = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!deployerPk) return; // silently skip if not configured

  const balance = await publicClient.getBalance({ address: botAddress });

  if (balance >= LOW_THRESHOLD) return; // still sufficient

  console.log(`\n  ⛽ Bot USDC low: ${formatUnits(balance, 18)} — auto-refilling 100 USDC from deployer...`);

  if (BOT_CONFIG.DRY_RUN) {
    console.log("  [DRY_RUN] Would transfer 100 USDC from deployer");
    return;
  }

  try {
    const deployer = createWalletClient({
      account:   privateKeyToAccount(deployerPk),
      chain:     arcTestnetChain,
      transport: http(BOT_CONFIG.RPC_URL),
    });

    const hash = await deployer.sendTransaction({
      to:    botAddress,
      value: REFILL_AMOUNT,
    });

    await publicClient.waitForTransactionReceipt({ hash });
    const newBal = await publicClient.getBalance({ address: botAddress });
    console.log(`  ✅ Refill done. New balance: ${formatUnits(newBal, 18)} USDC (tx: ${hash.slice(0, 14)}...)`);
  } catch (e: any) {
    console.warn(`  Refill failed: ${e.message?.slice(0, 80)}`);
  }
}
