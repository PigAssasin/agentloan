import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

async function main() {
  console.log("=== Contract verification ===\n");

  const pool     = await ethers.getContractAt("LendingPool",      ARC_TESTNET_CONTRACTS.LENDING_POOL);
  const oracle   = await ethers.getContractAt("PriceOraclePyth",  ARC_TESTNET_CONTRACTS.PRICE_ORACLE);
  const executor = await ethers.getContractAt("AgentExecutor",    ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR);
  const xUSDC    = await ethers.getContractAt("MockERC20",         ARC_TESTNET_CONTRACTS.X_USDC);
  const xEURC    = await ethers.getContractAt("MockERC20",         ARC_TESTNET_CONTRACTS.X_EURC);
  const xBTC     = await ethers.getContractAt("MockERC20",         ARC_TESTNET_CONTRACTS.X_CLR_BTC);

  // Pool token balances
  const poolUSDC = await xUSDC.balanceOf(ARC_TESTNET_CONTRACTS.LENDING_POOL);
  const poolEURC = await xEURC.balanceOf(ARC_TESTNET_CONTRACTS.LENDING_POOL);
  const poolBTC  = await xBTC.balanceOf(ARC_TESTNET_CONTRACTS.LENDING_POOL);
  console.log("Pool liquidity:");
  console.log(`  xUSDC:   $${ethers.formatUnits(poolUSDC, 6)}`);
  console.log(`  xEURC:   €${ethers.formatUnits(poolEURC, 6)}`);
  console.log(`  xclrBTC: ${ethers.formatUnits(poolBTC, 8)} BTC`);

  // Reserve data
  const r = await pool.getReserveData(ARC_TESTNET_CONTRACTS.X_USDC);
  console.log(`\nxUSDC reserve:`);
  console.log(`  totalScaledSupply: ${r.totalScaledSupply}`);
  console.log(`  totalScaledBorrow: ${r.totalScaledBorrow}`);
  console.log(`  borrowingEnabled:  ${r.borrowingEnabled}`);

  // AgentExecutor
  const botAuth = await executor.authorizedAgents("0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a");
  console.log(`\nAgentExecutor:`);
  console.log(`  Bot wallet authorized: ${botAuth}`);
  console.log(`  Pool:  ${await executor.pool()}`);
  console.log(`  xUSDC: ${await executor.xUSDC()}`);

  // Oracle
  const eurcStaleness = await oracle.stalenessMap(ARC_TESTNET_CONTRACTS.X_EURC);
  const btcStaleness  = await oracle.stalenessMap(ARC_TESTNET_CONTRACTS.X_CLR_BTC);
  console.log(`\nOracle staleness:`);
  console.log(`  xEURC:   ${eurcStaleness}s = ${Number(eurcStaleness)/86400} days`);
  console.log(`  xclrBTC: ${btcStaleness > 0n ? btcStaleness + "s" : "DEFAULT (3600s)"}`);

  // LendingPool authorization functions exist
  const reserveList = await pool.reserveList(0).catch(() => "N/A");
  console.log(`\nLendingPool v3:`);
  console.log(`  First reserve: ${reserveList}`);

  console.log("\n=== Summary ===");
  if (poolUSDC < ethers.parseUnits("100000", 6)) {
    console.log("  ⚠ Pool needs more xUSDC seeding (current:", ethers.formatUnits(poolUSDC, 6), ")");
  } else {
    console.log("  ✓ Pool liquidity OK");
  }
  console.log(`  ${botAuth ? "✓" : "✗"} Bot authorized in AgentExecutor`);
  console.log(`  ${eurcStaleness >= 2592000n ? "✓" : "✗"} EUR staleness 30 days`);
}

main().catch(console.error);
