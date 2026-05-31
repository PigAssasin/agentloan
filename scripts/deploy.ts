import { ethers } from "hardhat";
import * as fs from "fs";

const RAY = 10n ** 27n;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatUnits(await ethers.provider.getBalance(deployer.address), 6), "USDC");

  // ── 1. Mock tokens ────────────────────────────────────────────────
  console.log("\n[1/5] Deploying mock tokens...");
  const TokenFactory = await ethers.getContractFactory("MockERC20");
  const xUSDC   = await TokenFactory.deploy("Arc Testnet USD",  "xUSDC",   6);
  const xEURC   = await TokenFactory.deploy("Arc Testnet Euro", "xEURC",   6);
  const xclrBTC = await TokenFactory.deploy("Arc Testnet BTC",  "xclrBTC", 8);
  await xUSDC.waitForDeployment();
  await xEURC.waitForDeployment();
  await xclrBTC.waitForDeployment();
  console.log("  xUSDC:  ", await xUSDC.getAddress());
  console.log("  xEURC:  ", await xEURC.getAddress());
  console.log("  xclrBTC:", await xclrBTC.getAddress());

  // ── 2. Price feeds (mock on testnet) ─────────────────────────────
  console.log("\n[2/5] Deploying price feeds...");
  const AggFactory = await ethers.getContractFactory("MockAggregator");
  const btcFeed  = await AggFactory.deploy(8, 60_000n * 10n**8n); // $60,000
  const eurFeed  = await AggFactory.deploy(8, 108_000_000n);       // $1.08
  const usdcFeed = await AggFactory.deploy(8, 100_000_000n);       // $1.00
  await btcFeed.waitForDeployment();
  await eurFeed.waitForDeployment();
  await usdcFeed.waitForDeployment();
  console.log("  BTC feed: ", await btcFeed.getAddress());
  console.log("  EUR feed: ", await eurFeed.getAddress());
  console.log("  USDC feed:", await usdcFeed.getAddress());

  // ── 3. PriceOracle ────────────────────────────────────────────────
  console.log("\n[3/5] Deploying PriceOracle...");
  const oracle = await (await ethers.getContractFactory("PriceOracle")).deploy();
  await oracle.waitForDeployment();
  await oracle.setFeed(await xUSDC.getAddress(),   await usdcFeed.getAddress());
  await oracle.setFeed(await xEURC.getAddress(),   await eurFeed.getAddress());
  await oracle.setFeed(await xclrBTC.getAddress(), await btcFeed.getAddress());
  console.log("  PriceOracle:", await oracle.getAddress());

  // ── 4. InterestRateStrategy ───────────────────────────────────────
  console.log("\n[4/5] Deploying InterestRateStrategy...");
  const strategy = await (await ethers.getContractFactory("InterestRateStrategy")).deploy(
    RAY * 5n / 100n,   // 5% base
    RAY * 4n / 100n,   // 4% slope1
    RAY * 80n / 100n,  // 80% kink
    RAY * 145n / 100n  // 145% slope2
  );
  await strategy.waitForDeployment();
  console.log("  InterestRateStrategy:", await strategy.getAddress());

  // ── 5. LendingPool + init reserves ───────────────────────────────
  console.log("\n[5/5] Deploying LendingPool...");
  const pool = await (await ethers.getContractFactory("LendingPool")).deploy(
    await oracle.getAddress(),
    await strategy.getAddress()
  );
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("  LendingPool:", poolAddr);

  // Init reserves: xUSDC + xEURC borrowable, xclrBTC collateral only
  await pool.initReserve(await xUSDC.getAddress(),   6, true,  8000, 8500, 10500, 0);
  await pool.initReserve(await xEURC.getAddress(),   6, false, 8000, 8500, 10500, 0);
  await pool.initReserve(await xclrBTC.getAddress(), 8, false, 7000, 7500, 10500, 0);
  console.log("  Reserves initialized");

  // ── 6. Seed initial pool liquidity ───────────────────────────────
  console.log("\nSeeding pool with initial liquidity...");
  const USDC_SEED   = ethers.parseUnits("500000", 6);  // 500k xUSDC
  const EURC_SEED   = ethers.parseUnits("200000", 6);  // 200k xEURC
  const BTC_SEED    = ethers.parseUnits("10",     8);  // 10 xclrBTC

  // Mint to deployer — connect explicitly for safety
  await xUSDC.connect(deployer).ownerMint(deployer.address, USDC_SEED);
  console.log("  Minted xUSDC:", ethers.formatUnits(await xUSDC.balanceOf(deployer.address), 6));
  await xEURC.connect(deployer).ownerMint(deployer.address, EURC_SEED);
  console.log("  Minted xEURC:", ethers.formatUnits(await xEURC.balanceOf(deployer.address), 6));
  await xclrBTC.connect(deployer).ownerMint(deployer.address, BTC_SEED);
  console.log("  Minted xclrBTC:", ethers.formatUnits(await xclrBTC.balanceOf(deployer.address), 8));

  // Approve pool — explicit signer
  await xUSDC.connect(deployer).approve(poolAddr, USDC_SEED);
  await xEURC.connect(deployer).approve(poolAddr, EURC_SEED);
  await xclrBTC.connect(deployer).approve(poolAddr, BTC_SEED);
  console.log("  Approvals done");

  // Deposit into pool — explicit signer
  await pool.connect(deployer).deposit(await xUSDC.getAddress(),   USDC_SEED);
  console.log("  xUSDC deposited");
  await pool.connect(deployer).deposit(await xEURC.getAddress(),   EURC_SEED);
  console.log("  xEURC deposited");
  await pool.connect(deployer).deposit(await xclrBTC.getAddress(), BTC_SEED);
  console.log("  Pool seeded: 500k xUSDC, 200k xEURC, 10 xclrBTC");

  // ── 7. Write addresses to config ─────────────────────────────────
  const addresses = {
    LENDING_POOL:          await pool.getAddress(),
    PRICE_ORACLE:          await oracle.getAddress(),
    INTEREST_RATE_STRATEGY: await strategy.getAddress(),
    X_USDC:                await xUSDC.getAddress(),
    X_EURC:                await xEURC.getAddress(),
    X_CLR_BTC:             await xclrBTC.getAddress(),
    BTC_FEED:              await btcFeed.getAddress(),
    EUR_FEED:              await eurFeed.getAddress(),
    USDC_FEED:             await usdcFeed.getAddress(),
  };

  // Write to deployment file
  const deployFile = `deployments/${(await ethers.provider.getNetwork()).name}.json`;
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(deployFile, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses written to ${deployFile}`);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Copy these to config/contracts.ts and .env.local:");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
