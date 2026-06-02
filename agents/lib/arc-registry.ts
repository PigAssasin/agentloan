import { createPublicClient, http, parseAbi, type WalletClient } from "viem";
import { arcTestnetChain, BOT_CONFIG } from "../config";
import { ARC_AGENT_REGISTRY }          from "../../config/contracts";

const IDENTITY_ABI = parseAbi([
  "function register(string metadataURI) external returns (uint256)",
]);

const arcClient = createPublicClient({
  chain:     arcTestnetChain,
  transport: http(BOT_CONFIG.RPC_URL),
});

// Register bot as Arc ERC-8004 AI agent. Run ONCE via scripts/register-agent.ts.
//
// NOTE: giveFeedback (reputation) is intentionally not implemented.
// ERC-8004 forbids the agent owner from being their own reviewer — calling
// giveFeedback with owner == reviewer reverts. A separate reviewer wallet
// would be needed. Out of scope for this phase.
export async function registerAgent(
  wallet:      WalletClient,
  metadataURI = "https://agentloan.vercel.app/agents/liquidation-bot.json",
): Promise<bigint> {
  if (BOT_CONFIG.DRY_RUN) {
    console.log("[DRY_RUN] Would register agent:", metadataURI);
    return 0n;
  }

  const hash = await wallet.writeContract({
    address:      ARC_AGENT_REGISTRY.IDENTITY_REGISTRY,
    abi:          IDENTITY_ABI,
    functionName: "register",
    args:         [metadataURI],
  } as any);
  console.log("Register tx:", hash);

  const receipt = await arcClient.waitForTransactionReceipt({ hash });

  // ERC-721 Transfer(from=0x0, to=bot, tokenId) — tokenId in topics[3]
  const transferLog = receipt.logs.find(
    l => l.address.toLowerCase() === ARC_AGENT_REGISTRY.IDENTITY_REGISTRY.toLowerCase()
      && l.topics.length === 4,
  );
  if (!transferLog?.topics[3]) {
    throw new Error("Transfer event not found — check Identity Registry address");
  }

  const tokenId = BigInt(transferLog.topics[3]);
  console.log("Agent ID:", tokenId.toString());
  return tokenId;
}
