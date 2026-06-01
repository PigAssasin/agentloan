/**
 * Redeploy LendingPool using PriceOraclePyth (real-time Pyth prices).
 * Reuses existing tokens + strategy.
 */

import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const PYTH_ORACLE = "0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying LendingPool with Pyth oracle:", deployer.address);

  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
    PYTH_ORACLE,
    ARC_TESTNET_CONTRACTS.INTEREST_RATE_STRATEGY
  );
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("New LendingPool:", poolAddr);

  await pool.initReserve(ARC_TESTNET_CONTRACTS.X_USDC,    6, true,  8000, 8500, 10500, 0);
  await pool.initReserve(ARC_TESTNET_CONTRACTS.X_EURC,    6, false, 8000, 8500, 10500, 0);
  await pool.initReserve(ARC_TESTNET_CONTRACTS.X_CLR_BTC, 8, false, 7000, 7500, 10500, 0);
  console.log("Reserves initialized");

  const xUSDC   = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_USDC,    deployer);
  const xEURC   = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_EURC,    deployer);
  const xclrBTC = await ethers.getContractAt("MockERC20", ARC_TESTNET_CONTRACTS.X_CLR_BTC, deployer);

  const USDC_SEED = ethers.parseUnits("500000", 6);
  const EURC_SEED = ethers.parseUnits("200000", 6);
  const BTC_SEED  = ethers.parseUnits("10", 8);

  await (await xUSDC.ownerMint(deployer.address,   USDC_SEED)).wait();
  await (await xEURC.ownerMint(deployer.address,   EURC_SEED)).wait();
  await (await xclrBTC.ownerMint(deployer.address, BTC_SEED)).wait();
  await (await xUSDC.connect(deployer).approve(poolAddr,   USDC_SEED)).wait();
  await (await xEURC.connect(deployer).approve(poolAddr,   EURC_SEED)).wait();
  await (await xclrBTC.connect(deployer).approve(poolAddr, BTC_SEED)).wait();
  await (await pool.connect(deployer).deposit(ARC_TESTNET_CONTRACTS.X_USDC,    USDC_SEED)).wait();
  await (await pool.connect(deployer).deposit(ARC_TESTNET_CONTRACTS.X_EURC,    EURC_SEED)).wait();
  await (await pool.connect(deployer).deposit(ARC_TESTNET_CONTRACTS.X_CLR_BTC, BTC_SEED)).wait();
  console.log("Pool seeded: 500k xUSDC | 200k xEURC | 10 xclrBTC");

  console.log("\n=== UPDATE config/contracts.ts ===");
  console.log(`  LENDING_POOL: "${poolAddr}"`);
  console.log(`  PRICE_ORACLE: "${PYTH_ORACLE}"`);
}

main().catch(e => { console.error(e); process.exit(1); });
