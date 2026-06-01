import { ARC_TESTNET_CONTRACTS } from "../config/contracts";

export const BOT_CONFIG = {
  RPC_URL:      process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network",
  CHAIN_ID:     5042002 as const,
  LENDING_POOL: ARC_TESTNET_CONTRACTS.LENDING_POOL,
  PRICE_ORACLE: ARC_TESTNET_CONTRACTS.PRICE_ORACLE,
  TOKENS: [
    { address: ARC_TESTNET_CONTRACTS.X_USDC,    symbol: "xUSDC",   decimals: 6  },
    { address: ARC_TESTNET_CONTRACTS.X_EURC,    symbol: "xEURC",   decimals: 6  },
    { address: ARC_TESTNET_CONTRACTS.X_CLR_BTC, symbol: "xclrBTC", decimals: 8  },
  ],
  DEBT_TOKEN:  ARC_TESTNET_CONTRACTS.X_USDC as `0x${string}`,
  DRY_RUN:     process.env.DRY_RUN === "true",
  // Persists last scanned block between runs — avoids re-scanning full history
  STATE_FILE:  "agents/state/last-block.txt",
  // How stale oracle prices can be before bot updates them (seconds)
  ORACLE_STALENESS_THRESHOLD: 15,
  // Timeout for price update tx (ms) — prevents deadlock if tx hangs
  PRICE_UPDATE_TIMEOUT_MS: 10_000,
} as const;

// Arc Testnet chain definition for viem — required for chain validation
export const arcTestnetChain = {
  id:             BOT_CONFIG.CHAIN_ID,
  name:           "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls:        { default: { http: [BOT_CONFIG.RPC_URL] } },
} as const;
