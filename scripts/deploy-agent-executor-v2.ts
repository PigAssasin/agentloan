/**
 * Deploy AgentExecutor v2 — multi-asset yield executor
 * Run: npx hardhat run scripts/deploy-agent-executor-v2.ts --network arcTestnet
 *
 * After deploy: update AGENT_EXECUTOR in config/contracts.ts
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const LENDING_POOL = "0xA5F8E24a5a97e9cA763D0FB4777786B684Aceb9B";
const X_USDC       = "0xFa090bd1A524D861542888B6c5e7965dde1F4f35";
const X_EURC       = "0x11aC6A7f4c3235e4edda971838640bE9e55aC222";
const X_CLR_BTC    = "0x938ae31cc6418acc6730cF1AFFE53E91c143B078";
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance: ", ethers.formatUnits(await ethers.provider.getBalance(deployer.address), 6), "USDC");

  // Bot wallet = deployer wallet (personal-agent.ts uses DEPLOYER_PRIVATE_KEY)
  const BOT_WALLET = process.env.BOT_WALLET_ADDRESS ?? deployer.address;
  console.log("Bot wallet:", BOT_WALLET);

  // Deploy
  console.log("\nDeploying AgentExecutor v2...");
  const Factory = await ethers.getContractFactory("AgentExecutor");
  const executor = await Factory.deploy(LENDING_POOL, X_USDC);
  await executor.waitForDeployment();
  const addr = await executor.getAddress();
  console.log("AgentExecutor v2 deployed:", addr);

  // Authorize bot wallet
  console.log("Authorizing bot wallet:", BOT_WALLET);
  await (await executor.setAgent(BOT_WALLET, true)).wait();
  console.log("  Bot authorized ✓");

  // Whitelist tokens
  console.log("Whitelisting tokens...");
  await (await executor.setSupportedToken(X_EURC,    true)).wait();
  console.log("  xEURC whitelisted ✓");
  await (await executor.setSupportedToken(X_CLR_BTC, true)).wait();
  console.log("  xclrBTC whitelisted ✓");
  // xUSDC is whitelisted in constructor by default

  // Verify
  const botAuth    = await executor.authorizedAgents(BOT_WALLET);
  const usdcOk     = await executor.supportedTokens(X_USDC);
  const eurcOk     = await executor.supportedTokens(X_EURC);
  const btcOk      = await executor.supportedTokens(X_CLR_BTC);

  console.log("\n=== Verification ===");
  console.log("  Bot authorized:   ", botAuth  ? "✓" : "✗ FAILED");
  console.log("  xUSDC supported:  ", usdcOk   ? "✓" : "✗ FAILED");
  console.log("  xEURC supported:  ", eurcOk   ? "✓" : "✗ FAILED");
  console.log("  xclrBTC supported:", btcOk    ? "✓" : "✗ FAILED");

  console.log("\n=== Next Steps ===");
  console.log(`1. Update config/contracts.ts:`);
  console.log(`   AGENT_EXECUTOR: "${addr}" as \`0x\${string}\`,`);
  console.log(`2. Users must re-approve tokens to new address in UI`);
  console.log(`3. Users must re-run authorizeAgent(new_addr, true) in UI`);
  console.log(`4. Restart personal-agent on VPS`);
}

main().catch(e => { console.error(e); process.exit(1); });
