import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const AGENT_EXECUTOR_ABI = [
  "function setAgent(address agent, bool allowed) external",
  "function authorizedAgents(address) external view returns (bool)",
];

const BOT_WALLET = "0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a";

async function main() {
  const [deployer] = await ethers.getSigners();
  const executor = new ethers.Contract(ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, AGENT_EXECUTOR_ABI, deployer);
  const isAuth = await executor.authorizedAgents(BOT_WALLET);
  if (isAuth) { console.log("Already authorized"); return; }
  const tx = await executor.setAgent(BOT_WALLET, true);
  await tx.wait();
  console.log("Authorized:", BOT_WALLET, "TX:", tx.hash);
}
main().catch(console.error);
