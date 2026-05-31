import { ethers } from "hardhat";
import * as fs from "fs";

const RAY = 10n ** 27n;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Full deploy with:", deployer.address);

  // 1. Mock tokens (with 24h on-chain cooldown)
  console.log("\n[1/5] Mock tokens...");
  const T = await ethers.getContractFactory("MockERC20");
  const xUSDC   = await (await T.deploy("Arc Testnet USD",  "xUSDC",   6)).waitForDeployment();
  const xEURC   = await (await T.deploy("Arc Testnet Euro", "xEURC",   6)).waitForDeployment();
  const xclrBTC = await (await T.deploy("Arc Testnet BTC",  "xclrBTC", 8)).waitForDeployment();
  console.log("  xUSDC:  ", await xUSDC.getAddress());
  console.log("  xEURC:  ", await xEURC.getAddress());
  console.log("  xclrBTC:", await xclrBTC.getAddress());

  // 2. Price feeds (block.timestamp — never stale)
  console.log("\n[2/5] Price feeds...");
  const A = await ethers.getContractFactory("MockAggregator");
  const btcFeed  = await (await A.deploy(8, 60_000n * 10n**8n)).waitForDeployment();
  const eurFeed  = await (await A.deploy(8, 108_000_000n)).waitForDeployment();
  const usdcFeed = await (await A.deploy(8, 100_000_000n)).waitForDeployment();
  console.log("  BTC:  $60,000 |", await btcFeed.getAddress());
  console.log("  EUR:  $1.08   |", await eurFeed.getAddress());
  console.log("  USDC: $1.00   |", await usdcFeed.getAddress());

  // 3. Oracle
  console.log("\n[3/5] PriceOracle...");
  const oracle = await (await (await ethers.getContractFactory("PriceOracle")).deploy()).waitForDeployment();
  await (await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress())).wait();
  await (await oracle.setFeed(await xEURC.getAddress(),   await eurFeed.getAddress())).wait();
  await (await oracle.setFeed(await xclrBTC.getAddress(), await btcFeed.getAddress())).wait();
  console.log("  PriceOracle:", await oracle.getAddress());

  // 4. Interest rate strategy
  console.log("\n[4/5] InterestRateStrategy...");
  const strategy = await (await (await ethers.getContractFactory("InterestRateStrategy")).deploy(
    RAY * 5n / 100n, RAY * 4n / 100n, RAY * 80n / 100n, RAY * 145n / 100n
  )).waitForDeployment();
  console.log("  Strategy:", await strategy.getAddress());

  // 5. LendingPool + seed
  console.log("\n[5/5] LendingPool...");
  const pool = await (await (await ethers.getContractFactory("LendingPool")).deploy(
    await oracle.getAddress(), await strategy.getAddress()
  )).waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("  LendingPool:", poolAddr);

  await pool.initReserve(await xUSDC.getAddress(),   6, true,  8000, 8500, 10500, 0);
  await pool.initReserve(await xEURC.getAddress(),   6, false, 8000, 8500, 10500, 0);
  await pool.initReserve(await xclrBTC.getAddress(), 8, false, 7000, 7500, 10500, 0);
  console.log("  Reserves initialized");

  // Seed
  const USDC_SEED = ethers.parseUnits("500000", 6);
  const EURC_SEED = ethers.parseUnits("200000", 6);
  const BTC_SEED  = ethers.parseUnits("10", 8);
  await (await xUSDC.ownerMint(deployer.address,   USDC_SEED)).wait();
  await (await xEURC.ownerMint(deployer.address,   EURC_SEED)).wait();
  await (await xclrBTC.ownerMint(deployer.address, BTC_SEED)).wait();
  await (await xUSDC.connect(deployer).approve(poolAddr,   USDC_SEED)).wait();
  await (await xEURC.connect(deployer).approve(poolAddr,   EURC_SEED)).wait();
  await (await xclrBTC.connect(deployer).approve(poolAddr, BTC_SEED)).wait();
  await (await pool.connect(deployer).deposit(await xUSDC.getAddress(),   USDC_SEED)).wait();
  await (await pool.connect(deployer).deposit(await xEURC.getAddress(),   EURC_SEED)).wait();
  await (await pool.connect(deployer).deposit(await xclrBTC.getAddress(), BTC_SEED)).wait();
  console.log("  Seeded: 500k xUSDC | 200k xEURC | 10 xclrBTC");

  const addrs = {
    LENDING_POOL:          await pool.getAddress(),
    PRICE_ORACLE:          await oracle.getAddress(),
    INTEREST_RATE_STRATEGY: await strategy.getAddress(),
    X_USDC:    await xUSDC.getAddress(),
    X_EURC:    await xEURC.getAddress(),
    X_CLR_BTC: await xclrBTC.getAddress(),
    BTC_FEED:  await btcFeed.getAddress(),
    EUR_FEED:  await eurFeed.getAddress(),
    USDC_FEED: await usdcFeed.getAddress(),
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync("deployments/arcTestnet.json", JSON.stringify(addrs, null, 2));
  console.log("\n=== DONE — update config/contracts.ts ===");
  console.log(JSON.stringify(addrs, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
