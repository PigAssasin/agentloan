import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

// Redeploy MockAggregators with block.timestamp fix + re-register in oracle
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Redeploying feeds with:", deployer.address);

  const AggFactory = await ethers.getContractFactory("MockAggregator");
  const btcFeed  = await AggFactory.deploy(8, 60_000n * 10n**8n);
  const eurFeed  = await AggFactory.deploy(8, 108_000_000n);
  const usdcFeed = await AggFactory.deploy(8, 100_000_000n);
  await btcFeed.waitForDeployment();
  await eurFeed.waitForDeployment();
  await usdcFeed.waitForDeployment();
  console.log("BTC feed: ", await btcFeed.getAddress());
  console.log("EUR feed: ", await eurFeed.getAddress());
  console.log("USDC feed:", await usdcFeed.getAddress());

  // Re-register in existing PriceOracle
  const OracleFactory = await ethers.getContractFactory("PriceOracle");
  const oracle = OracleFactory.attach(ARC_TESTNET_CONTRACTS.PRICE_ORACLE);
  await (await oracle.connect(deployer).setFeed(ARC_TESTNET_CONTRACTS.X_CLR_BTC, await btcFeed.getAddress())).wait();
  await (await oracle.connect(deployer).setFeed(ARC_TESTNET_CONTRACTS.X_EURC,    await eurFeed.getAddress())).wait();
  await (await oracle.connect(deployer).setFeed(ARC_TESTNET_CONTRACTS.X_USDC,    await usdcFeed.getAddress())).wait();
  console.log("Feeds registered in oracle");

  console.log("\n=== UPDATE config/contracts.ts ===");
  console.log(`BTC_FEED:  "${await btcFeed.getAddress()}"`);
  console.log(`EUR_FEED:  "${await eurFeed.getAddress()}"`);
  console.log(`USDC_FEED: "${await usdcFeed.getAddress()}"`);
}

main().catch(e => { console.error(e); process.exit(1); });
