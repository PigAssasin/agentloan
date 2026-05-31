import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

// Redeploy only LendingPool — reuse existing oracle, strategy, mock tokens
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying LendingPool with:", deployer.address);

  const ORACLE   = ARC_TESTNET_CONTRACTS.PRICE_ORACLE;
  const STRATEGY = ARC_TESTNET_CONTRACTS.INTEREST_RATE_STRATEGY;
  const X_USDC   = ARC_TESTNET_CONTRACTS.X_USDC;
  const X_EURC   = ARC_TESTNET_CONTRACTS.X_EURC;
  const X_CLR_BTC = ARC_TESTNET_CONTRACTS.X_CLR_BTC;

  console.log("Reusing oracle:  ", ORACLE);
  console.log("Reusing strategy:", STRATEGY);

  // Deploy new LendingPool
  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(ORACLE, STRATEGY);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("\nNew LendingPool:", poolAddr);

  // Init reserves
  await pool.initReserve(X_USDC,    6, true,  8000, 8500, 10500, 0);
  await pool.initReserve(X_EURC,    6, false, 8000, 8500, 10500, 0);
  await pool.initReserve(X_CLR_BTC, 8, false, 7000, 7500, 10500, 0);
  console.log("Reserves initialized");

  // Seed pool
  const xUSDC   = await ethers.getContractAt("MockERC20", X_USDC,    deployer);
  const xEURC   = await ethers.getContractAt("MockERC20", X_EURC,    deployer);
  const xclrBTC = await ethers.getContractAt("MockERC20", X_CLR_BTC, deployer);

  const USDC_SEED = ethers.parseUnits("500000", 6);
  const EURC_SEED = ethers.parseUnits("200000", 6);
  const BTC_SEED  = ethers.parseUnits("10", 8);

  await (await xUSDC.ownerMint(deployer.address, USDC_SEED)).wait();
  await (await xEURC.ownerMint(deployer.address, EURC_SEED)).wait();
  await (await xclrBTC.ownerMint(deployer.address, BTC_SEED)).wait();

  await (await xUSDC.connect(deployer).approve(poolAddr, USDC_SEED)).wait();
  await (await xEURC.connect(deployer).approve(poolAddr, EURC_SEED)).wait();
  await (await xclrBTC.connect(deployer).approve(poolAddr, BTC_SEED)).wait();

  await (await pool.connect(deployer).deposit(X_USDC,    USDC_SEED)).wait();
  console.log("xUSDC seeded");
  await (await pool.connect(deployer).deposit(X_EURC,    EURC_SEED)).wait();
  console.log("xEURC seeded");
  await (await pool.connect(deployer).deposit(X_CLR_BTC, BTC_SEED)).wait();
  console.log("xclrBTC seeded");

  console.log("\n=== UPDATE config/contracts.ts ===");
  console.log(`  LENDING_POOL: "${poolAddr}"`);
  console.log(`  // in .env.local:`);
  console.log(`  NEXT_PUBLIC_LENDING_POOL_ADDRESS=${poolAddr}`);
}

main().catch(e => { console.error(e); process.exit(1); });
