import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const executor = await (await ethers.getContractFactory("AgentExecutor")).deploy(
    ARC_TESTNET_CONTRACTS.LENDING_POOL,
    ARC_TESTNET_CONTRACTS.X_USDC,
  );
  await executor.waitForDeployment();
  const addr = await executor.getAddress();
  console.log("New AgentExecutor:", addr);

  // Authorize bot wallet
  const BOT = "0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a";
  await (await executor.setAgent(BOT, true)).wait();
  console.log("Bot authorized:", BOT);

  // Update config
  let config = fs.readFileSync("config/contracts.ts", "utf8");
  config = config.replace(/AGENT_EXECUTOR:\s*"0x[0-9a-fA-F]+"/, `AGENT_EXECUTOR:        "${addr}"`);
  fs.writeFileSync("config/contracts.ts", config);
  console.log("config/contracts.ts updated");
  console.log("\nAlso update vercel.json NEXT_PUBLIC_AGENT_EXECUTOR_ADDRESS =", addr);
}

main().catch(console.error);
