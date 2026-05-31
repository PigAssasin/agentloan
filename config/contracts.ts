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

  // ── sinX Protocol — Arc Testnet deployment (scaled balances — interest accrues to users) ─
  LENDING_POOL:          "0xd67cA8a057554d6820952f37244B353A481E93A0" as `0x${string}`,
  PRICE_ORACLE:          "0xd04272EC72eA0bc2139367E4bD0d14398D539D97" as `0x${string}`,
  INTEREST_RATE_STRATEGY:"0xFFDb2d4d2Da7a4b0dF4c321E0ec29fB014b4Fe43" as `0x${string}`,

  // Mock testnet tokens — 24h on-chain cooldown per wallet
  X_USDC:   "0x0B4EF44fB19daB9F674E37c8566E94eAa6A4EB18" as `0x${string}`,
  X_EURC:   "0x9F1E8F2681E01298309220373E3266192Ac44cB1" as `0x${string}`,
  X_CLR_BTC:"0xfBE90A8be0BB00DC2A8de1471F8165A8B31A908c" as `0x${string}`,

  // Price feeds — block.timestamp, never stale
  BTC_FEED:  "0x371eb4D25495ed9Cb60B559Eb6Cd4A285e3b35d9" as `0x${string}`,
  EUR_FEED:  "0x12066063A3A396196964F64aA79e48FdC141218C" as `0x${string}`,
  USDC_FEED: "0xE52b1b19Fe2307bF243633Bbc26Af7B32f1cCd6f" as `0x${string}`,
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
