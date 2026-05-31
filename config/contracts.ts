// Tất cả địa chỉ contract trên Arc Testnet (Chain ID: 5042002)
// KHÔNG dùng địa chỉ Ethereum mainnet hay chain khác

export const ARC_TESTNET_CONTRACTS = {
  // ── Native Tokens ──────────────────────────────────────────────────────
  USDC: "0x3600000000000000000000000000000000000000",  // Gas token, 6 dec ERC-20
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",  // Euro stablecoin, 6 dec
  USYC: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",  // Yield-bearing, 6 dec

  // ── USYC Infrastructure ────────────────────────────────────────────────
  USYC_TELLER:        "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A",
  USYC_ENTITLEMENTS:  "0xcc205224862c7641930c87679e98999d23c26113",

  // ── CCTP v2 (Crosschain) ───────────────────────────────────────────────
  TOKEN_MESSENGER_V2:     "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  MESSAGE_TRANSMITTER_V2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  TOKEN_MINTER_V2:        "0xb43db544E2c27092c107639Ad201b3dEfAbcF192",
  GATEWAY_WALLET:         "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  GATEWAY_MINTER:         "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",

  // ── Utility ────────────────────────────────────────────────────────────
  PERMIT2:          "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  MULTICALL3:       "0xcA11bde05977b3631167028862bE2a173976CA11",
  CREATE2_FACTORY:  "0x4e59b44847b379578588920cA78FbF26c0B4956C",

  // ── sinX Protocol — Arc Testnet deployment (security-audited, scaled balances) ─
  LENDING_POOL:          "0x5358E0F0128bb87133a0214aAc26684cE73495CD" as `0x${string}`,
  PRICE_ORACLE:          "0xfac5bf8d41E74f55f41495853cB81D834C48F9f2" as `0x${string}`,
  INTEREST_RATE_STRATEGY:"0x896F6D0d3c2EFc2729d142EEb5227d39f82B4027" as `0x${string}`,

  // Mock testnet tokens — 24h on-chain cooldown per wallet
  X_USDC:   "0x1185FE79dd4Fc83c1C9B42E456C9E1cD0E7AB86e" as `0x${string}`,
  X_EURC:   "0xc3BF3eEb0eF4Ef3Bc22994CF09cadb648f201742" as `0x${string}`,
  X_CLR_BTC:"0xD1dD180F244262e80D53508b9Cf336A87D6f4088" as `0x${string}`,

  // Price feeds — block.timestamp, never stale, owner-protected
  BTC_FEED:  "0x5f6E1e0DC2D06FB288C62F28dc57d0ee9c6332E2" as `0x${string}`,
  EUR_FEED:  "0xAF293fe9315Cf8f24d218E9A4B9cbF0e1935edfe" as `0x${string}`,
  USDC_FEED: "0x6372a452dc2303386E7ae74bc990d7dca05Fd33c" as `0x${string}`,
} as const;

export const TOKEN_DECIMALS = {
  USDC: 6,
  EURC: 6,
  USYC: 6,
} as const;

// USDC có dual interface: 18 dec (native gas) vs 6 dec (ERC-20)
// Luôn dùng 6 dec khi tương tác ERC-20
export const USDC_NATIVE_DECIMALS = 18;
export const USDC_ERC20_DECIMALS  = 6;

// Oracle staleness tối đa cho price feeds (1 giờ)
export const MAX_ORACLE_STALENESS_SECONDS = 3600;
