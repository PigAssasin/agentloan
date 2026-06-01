/**
 * Deploy PriceOraclePyth and update LendingPool to use it.
 *
 * Pyth on Arc Testnet: 0x2880aB155794e7179c9eE2e38200202908C17B43
 *
 * Price IDs (same on all networks):
 *   BTC/USD:  0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
 *   EUR/USD:  0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b
 *   USDC/USD: 0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a
 */

import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const PYTH_ARC_TESTNET = "0x2880aB155794e7179c9eE2e38200202908C17B43";

const PRICE_IDS = {
  BTC:  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  EUR:  "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying PriceOraclePyth with:", deployer.address);

  // 1. Deploy PriceOraclePyth
  const factory = await ethers.getContractFactory("PriceOraclePyth");
  const pythOracle = await (await factory.deploy(PYTH_ARC_TESTNET)).waitForDeployment();
  const oracleAddr = await pythOracle.getAddress();
  console.log("PriceOraclePyth:", oracleAddr);

  // 2. Register token → Pyth price ID
  await (await pythOracle.setFeed(ARC_TESTNET_CONTRACTS.X_CLR_BTC, PRICE_IDS.BTC)).wait();
  await (await pythOracle.setFeed(ARC_TESTNET_CONTRACTS.X_EURC,    PRICE_IDS.EUR)).wait();
  await (await pythOracle.setFeed(ARC_TESTNET_CONTRACTS.X_USDC,    PRICE_IDS.USDC)).wait();
  console.log("Feeds registered");

  // 3. Test: try to read a price (will fail if Pyth has no recent data on testnet)
  console.log("\nTesting price read...");
  try {
    const btcPrice = await pythOracle.getPrice(ARC_TESTNET_CONTRACTS.X_CLR_BTC);
    console.log("  BTC/USD:", ethers.formatUnits(btcPrice, 18));
  } catch (e: any) {
    console.log("  Price read failed (expected if no Pyth data yet):", e.message?.slice(0,80));
    console.log("  → Run update-pyth-prices.ts to push initial price data");
  }

  console.log("\n=== UPDATE config/contracts.ts ===");
  console.log(`  PRICE_ORACLE_PYTH: "${oracleAddr}"`);
  console.log("\nThen update LendingPool to use PriceOraclePyth instead of PriceOracle.");
  console.log("Run: npx hardhat run scripts/redeploy-pool-pyth.ts --network arcTestnet");
}

main().catch(e => { console.error(e); process.exit(1); });
