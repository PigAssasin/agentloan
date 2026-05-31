import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

// Refresh MockAggregator timestamps — must run every <1 hour or redeploy with auto-timestamp
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Refreshing prices with:", deployer.address);

  const AggFactory = await ethers.getContractFactory("MockAggregator");
  const btcFeed  = AggFactory.attach(ARC_TESTNET_CONTRACTS.BTC_FEED);
  const eurFeed  = AggFactory.attach(ARC_TESTNET_CONTRACTS.EUR_FEED);
  const usdcFeed = AggFactory.attach(ARC_TESTNET_CONTRACTS.USDC_FEED);

  await (await btcFeed.connect(deployer).setAnswer(60_000n * 10n**8n)).wait();
  console.log("BTC feed refreshed: $60,000");

  await (await eurFeed.connect(deployer).setAnswer(108_000_000n)).wait();
  console.log("EUR feed refreshed: $1.08");

  await (await usdcFeed.connect(deployer).setAnswer(100_000_000n)).wait();
  console.log("USDC feed refreshed: $1.00");

  console.log("All prices refreshed — good for another hour");
}

main().catch(e => { console.error(e); process.exit(1); });
