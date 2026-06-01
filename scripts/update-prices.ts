/**
 * Fetches real market prices and updates MockAggregator on-chain.
 * Run: TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/update-prices.ts --network arcTestnet
 */

import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const FEEDS = {
  BTC:  ARC_TESTNET_CONTRACTS.BTC_FEED,
  EUR:  ARC_TESTNET_CONTRACTS.EUR_FEED,
  USDC: ARC_TESTNET_CONTRACTS.USDC_FEED,
};

async function fetchBtcPrice(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  );
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data = await res.json() as { bitcoin: { usd: number } };
  return data.bitcoin.usd;
}

async function fetchEurUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/EUR");
    if (!res.ok) throw new Error(`ExchangeRate API error: ${res.status}`);
    const data = await res.json() as { rates: { USD: number } };
    return data.rates.USD;
  } catch {
    console.log("  EUR/USD API failed — using fallback 1.08");
    return 1.08;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating prices with:", deployer.address);

  console.log("\nFetching real market prices...");
  const [btcUsd, eurUsd] = await Promise.all([fetchBtcPrice(), fetchEurUsd()]);
  const usdcUsd = 1.00;

  console.log(`  BTC/USD:  $${btcUsd.toLocaleString()}`);
  console.log(`  EUR/USD:  $${eurUsd.toFixed(4)}`);
  console.log(`  USDC/USD: $${usdcUsd.toFixed(2)}`);

  const AggFactory = await ethers.getContractFactory("MockAggregator");
  const toFeedPrice = (usd: number) => BigInt(Math.round(usd * 1e8));

  console.log("\nUpdating on-chain...");

  const btcFeed = AggFactory.attach(FEEDS.BTC) as any;
  await (await btcFeed.connect(deployer).setAnswer(toFeedPrice(btcUsd))).wait();
  console.log(`  ✓ BTC: $${btcUsd.toLocaleString()}`);

  const eurFeed = AggFactory.attach(FEEDS.EUR) as any;
  await (await eurFeed.connect(deployer).setAnswer(toFeedPrice(eurUsd))).wait();
  console.log(`  ✓ EUR: $${eurUsd.toFixed(4)}`);

  const usdcFeed = AggFactory.attach(FEEDS.USDC) as any;
  await (await usdcFeed.connect(deployer).setAnswer(toFeedPrice(usdcUsd))).wait();
  console.log(`  ✓ USDC: $${usdcUsd.toFixed(2)}`);

  console.log("\n✓ Done — prices valid for 1 hour");
}

main().catch(e => { console.error(e); process.exit(1); });
