/**
 * One-time: register Signal Agent on Arc ERC-8004 identity registry.
 *
 * Run once:
 *   TS_NODE_PROJECT=tsconfig.hardhat.json npx ts-node scripts/register-signal-agent.ts
 *
 * Requires SIGNAL_AGENT_PRIVATE_KEY in .env.local (separate wallet from bot).
 * After running, add to Signal Agent environment:
 *   SIGNAL_AGENT_ADDRESS=<address>
 *   SIGNAL_AGENT_ERC8004_ID=<id>
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createWalletClient, http }    from "viem";
import { privateKeyToAccount }         from "viem/accounts";
import { arcTestnetChain, BOT_CONFIG } from "../agents/config";
import { registerAgent }               from "../agents/lib/arc-registry";

async function main() {
  const pk = process.env.SIGNAL_AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) throw new Error("SIGNAL_AGENT_PRIVATE_KEY not set in .env.local");

  const wallet = createWalletClient({
    account:   privateKeyToAccount(pk),
    chain:     arcTestnetChain,
    transport: http(BOT_CONFIG.RPC_URL),
  });

  console.log("Registering Signal Agent wallet:", wallet.account!.address);

  const agentId = await registerAgent(
    wallet,
    "https://arcbank.vercel.app/agents/signal-agent.json",
  );

  console.log("\n✅ Signal Agent registered on Arc ERC-8004!");
  console.log("Add to /root/signal-agent/.env and /root/arcbank/.env.local:");
  console.log(`   SIGNAL_AGENT_ADDRESS=${wallet.account!.address}`);
  console.log(`   SIGNAL_AGENT_ERC8004_ID=${agentId.toString()}`);
}

main().catch(err => { console.error(err); process.exit(1); });
