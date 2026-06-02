/**
 * One-time Circle wallet setup for AgentLoan Liquidation Bot.
 *
 * Run: npm run agent:circle-setup
 *
 * Prerequisites:
 *   1. CIRCLE_API_KEY in .env.local
 *   2. CIRCLE_ENTITY_SECRET in .env.local (registered in console.circle.com)
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createBotCircleWallet } from "../agents/lib/circle-wallet";

async function main() {
  const wallet = await createBotCircleWallet();
  console.log("\n✅ Setup complete!");
  console.log("Add CIRCLE_WALLET_ID to .env.local and .env on VPS:");
  console.log(`   CIRCLE_WALLET_ID=${wallet.walletId}`);
  console.log(`   Bot address: ${wallet.address}`);
  console.log("\nFund this address with xUSDC from faucet for liquidation capital.");
}

main().catch(err => { console.error(err); process.exit(1); });
