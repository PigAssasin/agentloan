/**
 * Authorize bot wallet in AgentExecutor after deploy.
 * Run once after deploy-v3.ts.
 */
import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const AGENT_EXECUTOR_ABI = [
  "function setAgent(address agent, bool allowed) external",
  "function authorizedAgents(address) external view returns (bool)",
  "function owner() external view returns (address)",
];

const BOT_WALLET = "0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const executor = new ethers.Contract(
    ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR,
    AGENT_EXECUTOR_ABI,
    deployer,
  );

  const isAlreadyAuthorized = await executor.authorizedAgents(BOT_WALLET);
  if (isAlreadyAuthorized) {
    console.log("Bot wallet already authorized:", BOT_WALLET);
    return;
  }

  console.log("Authorizing bot wallet:", BOT_WALLET);
  const tx = await executor.setAgent(BOT_WALLET, true);
  await tx.wait();
  console.log("TX:", tx.hash);

  const confirmed = await executor.authorizedAgents(BOT_WALLET);
  console.log("Authorized:", confirmed, "✓");
}

main().catch(console.error);
