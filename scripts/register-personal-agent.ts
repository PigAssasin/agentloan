/**
 * Register Personal Agent on Arc ERC-8004 IdentityRegistry.
 * Run once — generates an Agent ID stored in config/contracts.ts.
 *
 * Arc docs: https://docs.arc.io/arc/tutorials/register-your-first-ai-agent
 *
 * Note: ERC-8004 requires validator != owner for reputation recording.
 * Owner wallet = deployer (DEPLOYER_PRIVATE_KEY)
 * Validator wallet = bot wallet (BOT_PRIVATE_KEY) — used to record reputation later
 */
import { ethers } from "hardhat";
import { ARC_AGENT_REGISTRY } from "../config/contracts";

// Using Arc docs example URI — good enough for testnet
// For mainnet: upload real JSON to IPFS via Pinata
const METADATA_URI =
  process.env.PERSONAL_AGENT_METADATA_URI ??
  "ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei";

const IDENTITY_REGISTRY_ABI = [
  "function register(string calldata metadataURI) external returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer (agent owner):", deployer.address);
  console.log("Metadata URI:", METADATA_URI);

  const registry = new ethers.Contract(
    ARC_AGENT_REGISTRY.IDENTITY_REGISTRY,
    IDENTITY_REGISTRY_ABI,
    deployer,
  );

  console.log("\nRegistering Personal Agent...");
  const tx = await registry.register(METADATA_URI);
  const receipt = await tx.wait();
  console.log("TX:", tx.hash);

  // Extract Agent ID from Transfer event (ERC-721 mint)
  const transferLog = receipt.logs
    .map((l: any) => {
      try { return registry.interface.parseLog(l); } catch { return null; }
    })
    .find((l: any) => l?.name === "Transfer");

  if (!transferLog) {
    throw new Error("Transfer event not found — registration may have failed");
  }

  const agentId = transferLog.args[2].toString();

  console.log("\n=== SUCCESS ===");
  console.log("Personal Agent ID:", agentId);
  console.log("Owner:", deployer.address);
  console.log("Explorer:", `https://testnet.arcscan.app/address/${deployer.address}`);
  console.log("\nAdd to config/contracts.ts AGENT_IDS:");
  console.log(`  PERSONAL_AGENT: "${agentId}",`);
}

main().catch(console.error);
