/**
 * Pushes latest Pyth price data on-chain for Arc Testnet.
 * Run: TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/update-pyth-prices.ts --network arcTestnet
 *
 * Pyth is a pull oracle — prices from Hermes must be submitted on-chain.
 * This script is called by the GitHub Action every 5 minutes.
 */

import { ethers } from "hardhat";

const PYTH_ORACLE  = "0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999";
const HERMES_URL   = "https://hermes.pyth.network";

const PRICE_IDS = [
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC/USD
  "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b", // EUR/USD
  "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", // USDC/USD
];

async function fetchPythUpdateData(): Promise<string[]> {
  const ids = PRICE_IDS.map(id => `ids[]=${id}`).join("&");
  const url  = `${HERMES_URL}/v2/updates/price/latest?${ids}&encoding=hex`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Hermes error: ${res.status}`);
  const data = await res.json() as { binary: { data: string[] } };
  return data.binary.data.map((d: string) => "0x" + d);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating Pyth prices on Arc Testnet:", deployer.address);

  console.log("Fetching price update from Pyth Hermes...");
  const updateData = await fetchPythUpdateData();
  console.log(`  Received ${updateData.length} price update(s)`);

  const oracle = await ethers.getContractAt("PriceOraclePyth", PYTH_ORACLE, deployer);
  const fee    = await oracle.getUpdateFee(updateData);
  console.log(`  Update fee: ${ethers.formatUnits(fee, 6)} USDC`);

  const tx = await oracle.connect(deployer).updatePrices(updateData, { value: fee });
  await tx.wait();
  console.log("  ✓ Prices updated on-chain");

  // Verify
  const { ARC_TESTNET_CONTRACTS } = await import("../config/contracts");
  try {
    const btc = await oracle.getPrice(ARC_TESTNET_CONTRACTS.X_CLR_BTC);
    console.log(`  BTC/USD: $${Number(ethers.formatUnits(btc, 18)).toLocaleString("en-US")}`);
  } catch (e: any) {
    console.log("  Could not verify price:", e.message?.slice(0, 60));
  }

  console.log("✓ Done");
}

main().catch(e => { console.error(e); process.exit(1); });
