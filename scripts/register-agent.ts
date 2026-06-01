/**
 * One-time: register ArcBank Liquidation Bot on Arc ERC-8004 identity registry.
 *
 * Run once:
 *   npm run agent:register
 *
 * After running, save BOT_AGENT_ID to .env.local on your VPS.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createWalletClient, http }    from "viem";
import { privateKeyToAccount }         from "viem/accounts";
import { arcTestnetChain, BOT_CONFIG } from "../agents/config";
import { registerAgent }               from "../agents/lib/arc-registry";

async function main() {
  const pk = process.env.BOT_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("BOT_PRIVATE_KEY not set in .env.local");

  const wallet = createWalletClient({
    account:   privateKeyToAccount(pk),
    chain:     arcTestnetChain,
    transport: http(BOT_CONFIG.RPC_URL),
  });

  console.log("Registering bot wallet:", wallet.account!.address);
  const agentId = await registerAgent(wallet);

  console.log("\n✅ Done! Add to .env.local on VPS:");
  console.log(`   BOT_AGENT_ID=${agentId.toString()}`);
}

main().catch(err => { console.error(err); process.exit(1); });
