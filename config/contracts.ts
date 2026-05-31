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

  // ── Arc Lending (deploy sau) ───────────────────────────────────────────
  LENDING_POOL:     "" as `0x${string}`,
  PRICE_ORACLE:     "" as `0x${string}`,
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
