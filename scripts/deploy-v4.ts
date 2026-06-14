/**
 * Deploy Phase 4.3: LendingPool v4 (getUserAccountDataAccrued) + AgentExecutor v4
 *
 * Reuses: PriceOraclePyth v3, InterestRateStrategy, xUSDC, xEURC, xclrBTC (same addresses)
 * New:    LendingPool v4, AgentExecutor v4 (must point to new pool — immutable ref)
 */
import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";
import * as fs from "fs";

const BOT_WALLET = process.env.NEXT_PUBLIC_BOT_ADDRESS ?? "";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Bot wallet:", BOT_WALLET || "(not set — set manually after deploy)");
  console.log("Reusing oracle:", ARC_TESTNET_CONTRACTS.PRICE_ORACLE);
  console.log("");

  // ── 1. Deploy LendingPool v4 ──────────────────────────────────────────────
  console.log("1/5 Deploying LendingPool v4 (with getUserAccountDataAccrued)...");
  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
    ARC_TESTNET_CONTRACTS.PRICE_ORACLE,
    ARC_TESTNET_CONTRACTS.INTEREST_RATE_STRATEGY
  );
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("    LendingPool v4:", poolAddr);

  // ── 2. Init reserves ──────────────────────────────────────────────────────
  console.log("2/5 Initializing reserves...");
  await (await pool.initReserve(ARC_TESTNET_CONTRACTS.X_USDC,    6, true,  8000, 8500, 10500, 0)).wait();
  await (await pool.initReserve(ARC_TESTNET_CONTRACTS.X_EURC,    6, false, 8000, 8500, 10500, 0)).wait();
  await (await pool.initReserve(ARC_TESTNET_CONTRACTS.X_CLR_BTC, 8, false, 7000, 7500, 10500, 0)).wait();
  console.log("    xUSDC, xEURC, xclrBTC initialized");

  // ── 3. Deploy AgentExecutor v4 ────────────────────────────────────────────
  console.log("3/5 Deploying AgentExecutor v4...");
  const executor = await (await ethers.getContractFactory("AgentExecutor")).deploy(
    poolAddr,
    ARC_TESTNET_CONTRACTS.X_USDC
  );
  await executor.waitForDeployment();
  const executorAddr = await executor.getAddress();
  console.log("    AgentExecutor v4:", executorAddr);

  if (BOT_WALLET) {
    await (await executor.setAgent(BOT_WALLET, true)).wait();
    console.log("    Bot wallet authorized:", BOT_WALLET);
  } else {
    console.log("    ⚠ BOT_WALLET not set — run setAgent() manually");
  }

  await (await executor.setSupportedToken(ARC_TESTNET_CONTRACTS.X_EURC,    true)).wait();
  await (await executor.setSupportedToken(ARC_TESTNET_CONTRACTS.X_CLR_BTC, true)).wait();
  console.log("    Tokens whitelisted: xUSDC (default) | xEURC | xclrBTC");

  // ── 4. Seed liquidity ─────────────────────────────────────────────────────
  console.log("4/5 Seeding liquidity...");
  const xUSDC   = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_USDC,    deployer);
  const xEURC   = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_EURC,    deployer);
  const xclrBTC = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_CLR_BTC, deployer);

  const USDC_SEED = ethers.parseUnits("10000000", 6);
  const EURC_SEED = ethers.parseUnits("10000000", 6);
  const BTC_SEED  = ethers.parseUnits("100", 8);

  await (await xUSDC.ownerMint(deployer.address, USDC_SEED)).wait();
  await (await xEURC.ownerMint(deployer.address, EURC_SEED)).wait();
  await (await xclrBTC.ownerMint(deployer.address, BTC_SEED)).wait();

  await (await xUSDC.approve(poolAddr, USDC_SEED)).wait();
  await (await xEURC.approve(poolAddr, EURC_SEED)).wait();
  await (await xclrBTC.approve(poolAddr, BTC_SEED)).wait();

  await (await pool.deposit(ARC_TESTNET_CONTRACTS.X_USDC,    USDC_SEED)).wait();
  await (await pool.deposit(ARC_TESTNET_CONTRACTS.X_EURC,    EURC_SEED)).wait();
  await (await pool.deposit(ARC_TESTNET_CONTRACTS.X_CLR_BTC, BTC_SEED)).wait();
  console.log("    Seeded: 10M xUSDC | 10M xEURC | 100 xclrBTC");

  // ── 5. Update config/contracts.ts ─────────────────────────────────────────
  console.log("5/5 Updating config/contracts.ts...");
  const configPath = "config/contracts.ts";
  let config = fs.readFileSync(configPath, "utf8");

  config = config
    .replace(/LENDING_POOL:\s+"0x[0-9a-fA-F]+"[^,]*/, `LENDING_POOL:          "${poolAddr}" as \`0x\${string}\`, // v4: getUserAccountDataAccrued`)
    .replace(/AGENT_EXECUTOR:\s+"0x[0-9a-fA-F]+"[^,]*/, `AGENT_EXECUTOR:        "${executorAddr}" as \`0x\${string}\`, // v4: points to LendingPool v4`);

  fs.writeFileSync(configPath, config);
  console.log("    config/contracts.ts updated");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("DEPLOY v4 COMPLETE");
  console.log("════════════════════════════════════════");
  console.log("LendingPool v4:   ", poolAddr);
  console.log("AgentExecutor v4: ", executorAddr);
  console.log("PriceOraclePyth:  ", ARC_TESTNET_CONTRACTS.PRICE_ORACLE, "(reused)");
  console.log("");
  console.log("Next steps:");
  console.log("1. git add -A && git commit && git push");
  console.log("2. pm2 restart personal-agent on VPS");
  if (!BOT_WALLET) {
    console.log("3. Run executor.setAgent(BOT_WALLET, true) manually");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
