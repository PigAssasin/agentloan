/**
 * Deploy Phase 2: PriceOraclePyth v3 + LendingPool v3 + AgentExecutor
 *
 * Reuses: InterestRateStrategy, xUSDC, xEURC, xclrBTC (existing addresses)
 * New:    PriceOraclePyth, LendingPool, AgentExecutor
 */
import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";
import * as fs from "fs";

const PYTH_ARC_TESTNET = "0x2880aB155794e7179c9eE2e38200202908C17B43";
const PRICE_IDS = {
  BTC:  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  EUR:  "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};
const THIRTY_DAYS = 30 * 24 * 3600;
const BOT_WALLET  = process.env.NEXT_PUBLIC_BOT_ADDRESS ?? "";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Bot wallet:", BOT_WALLET || "(not set — set manually after deploy)");
  console.log("");

  // ── 1. Deploy PriceOraclePyth v3 ─────────────────────────────────────────
  console.log("1/6 Deploying PriceOraclePyth...");
  const oracle = await (await ethers.getContractFactory("PriceOraclePyth")).deploy(PYTH_ARC_TESTNET);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log("    Oracle:", oracleAddr);

  await (await oracle.setFeed(ARC_TESTNET_CONTRACTS.X_CLR_BTC, PRICE_IDS.BTC)).wait();
  await (await oracle.setFeed(ARC_TESTNET_CONTRACTS.X_EURC,    PRICE_IDS.EUR)).wait();
  await (await oracle.setFeed(ARC_TESTNET_CONTRACTS.X_USDC,    PRICE_IDS.USDC)).wait();
  await (await oracle.setStaleness(ARC_TESTNET_CONTRACTS.X_EURC, THIRTY_DAYS)).wait();
  console.log("    Feeds registered + EUR staleness = 30 days");

  // ── 2. Deploy LendingPool v3 ──────────────────────────────────────────────
  console.log("2/6 Deploying LendingPool v3...");
  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
    oracleAddr,
    ARC_TESTNET_CONTRACTS.INTEREST_RATE_STRATEGY
  );
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("    LendingPool:", poolAddr);

  // ── 3. Init reserves ──────────────────────────────────────────────────────
  console.log("3/6 Initializing reserves...");
  await (await pool.initReserve(ARC_TESTNET_CONTRACTS.X_USDC,    6, true,  8000, 8500, 10500, 0)).wait();
  await (await pool.initReserve(ARC_TESTNET_CONTRACTS.X_EURC,    6, false, 8000, 8500, 10500, 0)).wait();
  await (await pool.initReserve(ARC_TESTNET_CONTRACTS.X_CLR_BTC, 8, false, 7000, 7500, 10500, 0)).wait();
  console.log("    xUSDC, xEURC, xclrBTC initialized");

  // ── 4. Deploy AgentExecutor ───────────────────────────────────────────────
  console.log("4/6 Deploying AgentExecutor...");
  const executor = await (await ethers.getContractFactory("AgentExecutor")).deploy(
    poolAddr,
    ARC_TESTNET_CONTRACTS.X_USDC
  );
  await executor.waitForDeployment();
  const executorAddr = await executor.getAddress();
  console.log("    AgentExecutor:", executorAddr);

  if (BOT_WALLET) {
    await (await executor.setAgent(BOT_WALLET, true)).wait();
    console.log("    Bot wallet authorized:", BOT_WALLET);
  } else {
    console.log("    ⚠ BOT_WALLET not set — run setAgent() manually");
  }

  // Whitelist all 3 tokens (xUSDC is set in constructor; xEURC + xclrBTC need explicit call)
  await (await executor.setSupportedToken(ARC_TESTNET_CONTRACTS.X_EURC,    true)).wait();
  await (await executor.setSupportedToken(ARC_TESTNET_CONTRACTS.X_CLR_BTC, true)).wait();
  console.log("    Tokens whitelisted: xUSDC (default) | xEURC | xclrBTC");

  // ── 5. Seed liquidity ─────────────────────────────────────────────────────
  console.log("5/6 Seeding liquidity...");
  const xUSDC   = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_USDC,    deployer);
  const xEURC   = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_EURC,    deployer);
  const xclrBTC = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_CLR_BTC, deployer);

  const USDC_SEED = ethers.parseUnits("10000000", 6); // 10M xUSDC
  const EURC_SEED = ethers.parseUnits("10000000", 6); // 10M xEURC
  const BTC_SEED  = ethers.parseUnits("100", 8);      // 100 xclrBTC

  await (await xUSDC.ownerMint(deployer.address, USDC_SEED)).wait();
  await (await xEURC.ownerMint(deployer.address, EURC_SEED)).wait();
  await (await xclrBTC.ownerMint(deployer.address, BTC_SEED)).wait();

  await (await xUSDC.connect(deployer).approve(poolAddr, USDC_SEED)).wait();
  await (await xEURC.connect(deployer).approve(poolAddr, EURC_SEED)).wait();
  await (await xclrBTC.connect(deployer).approve(poolAddr, BTC_SEED)).wait();

  await (await pool.connect(deployer).deposit(ARC_TESTNET_CONTRACTS.X_USDC,    USDC_SEED)).wait();
  await (await pool.connect(deployer).deposit(ARC_TESTNET_CONTRACTS.X_EURC,    EURC_SEED)).wait();
  await (await pool.connect(deployer).deposit(ARC_TESTNET_CONTRACTS.X_CLR_BTC, BTC_SEED)).wait();
  console.log("    Seeded: 10M xUSDC | 10M xEURC | 100 xclrBTC");

  // ── 6. Update config/contracts.ts ─────────────────────────────────────────
  console.log("6/6 Updating config/contracts.ts...");
  const configPath = "config/contracts.ts";
  let config = fs.readFileSync(configPath, "utf8");

  config = config
    .replace(/LENDING_POOL:\s*"0x[0-9a-fA-F]+"/, `LENDING_POOL:          "${poolAddr}"`)
    .replace(/PRICE_ORACLE:\s*"0x[0-9a-fA-F]+"[^,]*/, `PRICE_ORACLE:          "${oracleAddr}" as \`0x\${string}\`, // PriceOraclePyth v3 — EUR 30d staleness`);

  // Add AGENT_EXECUTOR if not present
  if (!config.includes("AGENT_EXECUTOR")) {
    config = config.replace(
      /\/\/ Mock testnet tokens/,
      `AGENT_EXECUTOR:        "${executorAddr}" as \`0x\${string}\`,\n\n  // Mock testnet tokens`
    );
  } else {
    config = config.replace(/AGENT_EXECUTOR:\s*"0x[0-9a-fA-F]+"/, `AGENT_EXECUTOR:        "${executorAddr}"`);
  }

  fs.writeFileSync(configPath, config);
  console.log("    config/contracts.ts updated");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("DEPLOY COMPLETE");
  console.log("════════════════════════════════════════");
  console.log("PriceOraclePyth v3:", oracleAddr);
  console.log("LendingPool v3:    ", poolAddr);
  console.log("AgentExecutor:     ", executorAddr);
  console.log("");
  console.log("Next steps:");
  console.log("1. Update vercel.json with new addresses");
  console.log("2. git add -A && git commit && git push");
  console.log("3. Update VPS .env.local");
  console.log("4. pm2 restart all");
  if (!BOT_WALLET) {
    console.log("5. Run executor.setAgent(BOT_WALLET, true) manually");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
