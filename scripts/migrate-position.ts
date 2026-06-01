/**
 * Withdraw all positions from old LendingPool and re-deposit to new one.
 * Run: TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat run scripts/migrate-position.ts --network arcTestnet
 */

import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const OLD_POOL = "0x893D0223f63A06CFf83F0e9ef4d58af1Ad2B95fb";
const NEW_POOL = ARC_TESTNET_CONTRACTS.LENDING_POOL;

const TOKENS = [
  { address: ARC_TESTNET_CONTRACTS.X_USDC,    symbol: "xUSDC",   decimals: 6  },
  { address: ARC_TESTNET_CONTRACTS.X_EURC,    symbol: "xEURC",   decimals: 6  },
  { address: ARC_TESTNET_CONTRACTS.X_CLR_BTC, symbol: "xclrBTC", decimals: 8  },
];

async function main() {
  const [user] = await ethers.getSigners();
  console.log("Migrating positions for:", user.address);
  console.log("From:", OLD_POOL);
  console.log("To:  ", NEW_POOL);

  const oldPool = await ethers.getContractAt("LendingPool", OLD_POOL, user);
  const newPool = await ethers.getContractAt("LendingPool", NEW_POOL, user);

  for (const token of TOKENS) {
    const balance = await oldPool.getUserSupplyBalance(token.address, user.address);
    if (balance === 0n) {
      console.log(`\n${token.symbol}: nothing to migrate`);
      continue;
    }
    const fmt = ethers.formatUnits(balance, token.decimals);
    console.log(`\n${token.symbol}: ${fmt} → withdrawing from old pool...`);

    // Withdraw from old pool
    await (await oldPool.withdraw(token.address, balance)).wait();
    console.log(`  ✓ Withdrawn ${fmt} ${token.symbol}`);

    // Deposit to new pool
    const erc20 = await ethers.getContractAt("MockERC20", token.address, user);
    await (await erc20.approve(NEW_POOL, balance)).wait();
    await (await newPool.deposit(token.address, balance)).wait();
    console.log(`  ✓ Re-deposited to new pool`);
  }

  console.log("\n✓ Migration complete");
}

main().catch(e => { console.error(e); process.exit(1); });
