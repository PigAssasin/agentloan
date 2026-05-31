import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Use tsconfig.hardhat.json for contract compilation and tests
process.env.TS_NODE_PROJECT = "tsconfig.hardhat.json";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    hardhat: {},
    arcTestnet: {
      url: process.env.NEXT_PUBLIC_ARC_RPC || "https://rpc.testnet.arc.network",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 5042002,
    },
  },
};

export default config;
