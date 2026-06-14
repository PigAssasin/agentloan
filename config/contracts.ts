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

  // ── Pyth Network on Arc Testnet ────────────────────────────────────────────
  PYTH: "0x2880aB155794e7179c9eE2e38200202908C17B43" as `0x${string}`,

  // ── AgentLoan Protocol — Arc Testnet (Phase 3 deploy) ────────────────────────
  LENDING_POOL:          "0x75A8d2c7ad4dC11d566091d19354cB3bD3720fbA" as `0x${string}`, // v3: withdrawAndRepayFor, HF guard
  PRICE_ORACLE:          "0xBA2ab92aBbbeD432cd5e57DE8fE9ED1dFed16CdF" as `0x${string}`, // PriceOraclePyth v3 — expo fix, EUR 30d staleness
  INTEREST_RATE_STRATEGY:"0x22B2A153F7694e49096ef91D627a80c5b6602Ffd" as `0x${string}`,

  AGENT_EXECUTOR:        "0x2335Ce2aBd5aB6cbB4EE69662fe1d1830D5D65Be" as `0x${string}`, // v3: correct events, atomic emergencyProtect

  // Mock testnet tokens — 24h on-chain cooldown per wallet
  X_USDC:   "0xFa090bd1A524D861542888B6c5e7965dde1F4f35" as `0x${string}`,
  X_EURC:   "0x11aC6A7f4c3235e4edda971838640bE9e55aC222" as `0x${string}`,
  X_CLR_BTC:"0x938ae31cc6418acc6730cF1AFFE53E91c143B078" as `0x${string}`,

  // Price feeds — block.timestamp, never stale, owner-protected
  BTC_FEED:  "0x310E587E79a10277A72f98a24Ae37eFA73A2c81a" as `0x${string}`,
  EUR_FEED:  "0x23bBf59113999f1ef7B3168577B837BAb60bcd7F" as `0x${string}`,
  USDC_FEED: "0x0D2f1783498b699437CAac6077745feAc55350C4" as `0x${string}`,
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

// ── Arc ERC-8004 AI Agent Registry ─────────────────────────────────────────
export const ARC_AGENT_REGISTRY = {
  IDENTITY_REGISTRY:   "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
  REPUTATION_REGISTRY: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as `0x${string}`,
  VALIDATION_REGISTRY: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as `0x${string}`,
} as const;

// ── Agent IDs (ERC-8004 token IDs) ──────────────────────────────────────────
export const AGENT_IDS = {
  COORDINATOR:     "34625",
  LIQUIDATION_BOT: "30907",
  SIGNAL_AGENT:    "31772",
  PERSONAL_AGENT:  "67459",
} as const;
