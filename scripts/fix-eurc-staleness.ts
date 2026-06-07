import { ethers } from "hardhat";
import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

const ORACLE_ABI = [
  "function setStaleness(address token, uint256 maxAge) external",
  "function stalenessMap(address) external view returns (uint256)",
  "function DEFAULT_STALENESS() external view returns (uint256)",
];

// EUR/USD Pyth testnet publishes ~every 30h — set 30 days to be safe
const THIRTY_DAYS = 30 * 24 * 3600;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const oracle = new ethers.Contract(
    ARC_TESTNET_CONTRACTS.PRICE_ORACLE,
    ORACLE_ABI,
    deployer,
  );

  const defaultStaleness = await oracle.DEFAULT_STALENESS();
  const currentEUR = await oracle.stalenessMap(ARC_TESTNET_CONTRACTS.X_EURC);
  console.log("DEFAULT_STALENESS:", defaultStaleness.toString(), "s");
  console.log("Current xEURC staleness:", currentEUR.toString(), "s (", Number(currentEUR) / 3600, "h)");

  console.log(`\nSetting xEURC staleness → ${THIRTY_DAYS}s (30 days)...`);
  const tx = await oracle.setStaleness(ARC_TESTNET_CONTRACTS.X_EURC, THIRTY_DAYS);
  await tx.wait();
  console.log("TX:", tx.hash);

  const newStaleness = await oracle.stalenessMap(ARC_TESTNET_CONTRACTS.X_EURC);
  console.log("New xEURC staleness:", newStaleness.toString(), "s (", Number(newStaleness) / 3600, "h) ✓");
}

main().catch(console.error);
