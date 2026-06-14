/**
 * AgentLoan Personal Agent v2 — Smart DeFi Optimizer
 *
 * Decision engine:
 *   Tier 1 (every 20 blocks, free): urgency scoring via HF
 *   Tier 2 (5-min cooldown): full LLM reasoning with portfolio context
 *
 * Context fed to LLM:
 *   - Supply/borrow APY for all 3 assets (from getReserveData)
 *   - Wallet balances: xUSDC, xEURC, xclrBTC
 *   - Pool positions: supplied/borrowed per asset
 *   - Net yield P&L, available borrow capacity
 *
 * Actions:
 *   repay             — repay xUSDC debt from wallet
 *   emergency_protect — withdraw collateral + repay atomic (when wallet empty)
 *   supply_usdc       — wallet xUSDC → pool
 *   supply_eurc       — wallet xEURC → pool  [Phase 2: AgentExecutor v2]
 *   supply_btc        — wallet xclrBTC → pool [Phase 2: AgentExecutor v2]
 *   withdraw_usdc     — pool xUSDC → wallet   [Phase 2: AgentExecutor v2]
 *   notify_borrow     — Telegram suggestion only (pool has no borrowFor)
 *   skip
 *
 * ERC-8004: Agent ID #67459
 */
import * as dotenv from "dotenv";
import * as path   from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import {
  createPublicClient, createWalletClient, http,
  parseAbi, parseUnits, formatUnits, keccak256, toHex,
  encodeFunctionData, decodeFunctionResult,
} from "viem";
import { privateKeyToAccount }             from "viem/accounts";
import { callLLM }                         from "./lib/gemini-client";
import { getPositionsBatch, UserPosition } from "./lib/pool-reader";
import { ARC_TESTNET_CONTRACTS, ARC_AGENT_REGISTRY, AGENT_IDS } from "../config/contracts";

// ── Config ─────────────────────────────────────────────────────────────────

const DRY_RUN      = process.env.DRY_RUN === "true";
const BACKTEST     = process.env.BACKTEST === "true";
const MIN_LLM_MS   = 5 * 60 * 1000;
const MIN_SUPPLY   = parseUnits("10", 6);   // $10 minimum to supply
const MIN_COVERAGE = 0.10;

const arcChain = {
  id: 5042002 as const, name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.network"] } },
} as const;

const publicClient   = createPublicClient({ chain: arcChain, transport: http() });

const _pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!_pk || !/^0x[0-9a-fA-F]{64}$/.test(_pk)) {
  console.error("[FATAL] DEPLOYER_PRIVATE_KEY missing or invalid. Expected 0x + 64 hex chars.");
  console.error("        Check /root/arcbank/.env.local on VPS and restart with: pm2 restart personal-agent");
  process.exit(1);
}
const deployerAccount = privateKeyToAccount(_pk as `0x${string}`);
const deployerWallet  = createWalletClient({ account: deployerAccount, chain: arcChain, transport: http() });

const SB_URL     = process.env.SUPABASE_URL!;
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" };

// ── ABIs ────────────────────────────────────────────────────────────────────

const EXECUTOR_ABI = parseAbi([
  "function emergencyProtect(address user, uint256 repayAmount) external",
  "function repayFromWallet(address user, uint256 repayAmount) external",
  "function deployToYield(address user, uint256 amount) external",
  "function deployTokenToYield(address user, address token, uint256 amount) external",
  "function withdrawTokenFromYield(address user, address token, uint256 amount) external",
  "function repayTokenFromWallet(address user, address token, uint256 amount) external",
]);

const POOL_ABI = parseAbi([
  "function getUserAccountData(address) external view returns (uint256 totalCollateralUSD, uint256 totalRawCollateralUSD, uint256 totalDebtUSD, uint256 availableBorrowsUSD, uint256 healthFactor)",
  "function agentAuthorized(address,address) external view returns (bool)",
  "function getUserSupplyBalance(address token, address user) external view returns (uint256)",
  "function getUserBorrowBalance(address token, address user) external view returns (uint256)",
  "function getReserveData(address) external view returns (uint128 liquidityIndex, uint128 borrowIndex, uint128 currentLiquidityRate, uint128 currentBorrowRate, uint32 lastUpdateTimestamp, uint8 decimals, bool borrowingEnabled, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint128 totalScaledSupply, uint128 totalScaledBorrow, uint256 supplyCap)",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address,address) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
]);

const REPUTATION_ABI = parseAbi([
  "function giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32) external",
]);

const PRICE_ORACLE_ABI = parseAbi([
  "function getPrice(address token) external view returns (uint256)",
]);

const MULTICALL3_ADDR = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const MULTICALL3_ABI = [
  {
    name: "aggregate3", type: "function", stateMutability: "view",
    inputs: [{ name: "calls", type: "tuple[]", components: [
      { name: "target",       type: "address" },
      { name: "allowFailure", type: "bool"    },
      { name: "callData",     type: "bytes"   },
    ]}],
    outputs: [{ name: "returnData", type: "tuple[]", components: [
      { name: "success",    type: "bool"  },
      { name: "returnData", type: "bytes" },
    ]}],
  },
] as const;

// ── Asset registry ──────────────────────────────────────────────────────────

const ASSETS = [
  { sym: "xUSDC",   addr: ARC_TESTNET_CONTRACTS.X_USDC,    dec: 6  },
  { sym: "xEURC",   addr: ARC_TESTNET_CONTRACTS.X_EURC,    dec: 6  },
  { sym: "xclrBTC", addr: ARC_TESTNET_CONTRACTS.X_CLR_BTC, dec: 8  },
] as const;

type AssetSym = "xUSDC" | "xEURC" | "xclrBTC";

// ── Types ───────────────────────────────────────────────────────────────────

interface UserSub {
  wallet_address:   string;
  hf_target:        number;
  enabled:          boolean;
  last_llm_call_at: string | null;
  llm_api_key_enc:  string | null;
}

interface MarketRate {
  supplyAPY: number;  // %
  borrowAPY: number;  // %
}

interface PortfolioContext {
  hf:                   number;
  debtUSD:              number;
  weightedCollUSD:      number;
  availableBorrowsUSD:  number;
  markets:              Record<AssetSym, MarketRate>;
  wallet:               Record<AssetSym, number>;   // USD value
  walletRaw:            Record<AssetSym, bigint>;   // raw on-chain amount
  supplied:             Record<AssetSym, number>;   // USD value in pool
  suppliedRaw:          Record<AssetSym, bigint>;   // raw on-chain amount in pool
  borrowed:             Record<AssetSym, number>;   // USD value in pool
  borrowedRaw:          Record<AssetSym, bigint>;   // raw on-chain amount borrowed
  netYieldPerYear:      number;                     // USD/yr (can be negative)
  executorAllowance:    bigint;                     // xUSDC approved to executor (backward compat)
  allowances:           Record<AssetSym, bigint>;   // all tokens approved to executor
  prices:               Record<AssetSym, number>;   // USD price per token unit
}

type ActionType =
  | "emergency_protect"
  | "repay"
  | "supply_usdc"
  | "supply_eurc"
  | "supply_btc"
  | "withdraw_usdc"
  | "rebalance"
  | "notify_borrow"
  | "skip";

interface Decision {
  action:    ActionType;
  amountUsd: number;
  reason:    string;
}

// ── Portfolio context fetcher ────────────────────────────────────────────────

async function fetchPortfolioContext(walletAddr: string): Promise<PortfolioContext> {
  const w        = walletAddr as `0x${string}`;
  const pool     = ARC_TESTNET_CONTRACTS.LENDING_POOL;
  const executor = ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR;
  const oracle   = ARC_TESTNET_CONTRACTS.PRICE_ORACLE;

  // 18-call Multicall3 batch — 1 RPC round-trip
  // [0]     getUserAccountData
  // [1-3]   getReserveData × 3
  // [4-6]   balanceOf (wallet) × 3
  // [7-9]   getUserSupplyBalance × 3
  // [10-12] getUserBorrowBalance × 3
  // [13-15] allowance (xUSDC/xEURC/xclrBTC → executor) × 3
  // [16]    getPrice(xclrBTC) — real oracle price
  // [17]    getPrice(xEURC)   — real oracle price
  const enc = <T extends readonly unknown[]>(abi: T, fn: string, args: unknown[]) =>
    encodeFunctionData({ abi: abi as Parameters<typeof encodeFunctionData>[0]["abi"], functionName: fn, args } as Parameters<typeof encodeFunctionData>[0]);

  const calls = [
    { target: pool,   allowFailure: true, callData: enc(POOL_ABI, "getUserAccountData", [w]) },
    ...ASSETS.map(a => ({ target: pool,   allowFailure: true, callData: enc(POOL_ABI,   "getReserveData",        [a.addr]) })),
    ...ASSETS.map(a => ({ target: a.addr, allowFailure: true, callData: enc(ERC20_ABI,  "balanceOf",             [w]) })),
    ...ASSETS.map(a => ({ target: pool,   allowFailure: true, callData: enc(POOL_ABI,   "getUserSupplyBalance",   [a.addr, w]) })),
    ...ASSETS.map(a => ({ target: pool,   allowFailure: true, callData: enc(POOL_ABI,   "getUserBorrowBalance",   [a.addr, w]) })),
    ...ASSETS.map(a => ({ target: a.addr, allowFailure: true, callData: enc(ERC20_ABI,  "allowance",             [w, executor]) })),
    { target: oracle, allowFailure: true, callData: enc(PRICE_ORACLE_ABI, "getPrice", [ARC_TESTNET_CONTRACTS.X_CLR_BTC]) },
    { target: oracle, allowFailure: true, callData: enc(PRICE_ORACLE_ABI, "getPrice", [ARC_TESTNET_CONTRACTS.X_EURC]) },
  ];

  const results = await publicClient.readContract({
    address: MULTICALL3_ADDR, abi: MULTICALL3_ABI,
    functionName: "aggregate3", args: [calls],
  }) as Array<{ success: boolean; returnData: `0x${string}` }>;

  function tryDecode<T>(abi: readonly unknown[], fn: string, idx: number, fallback: T): T {
    const r = results[idx];
    if (!r?.success || !r.returnData || r.returnData === "0x") return fallback;
    try { return decodeFunctionResult({ abi: abi as Parameters<typeof decodeFunctionResult>[0]["abi"], functionName: fn, data: r.returnData }) as T; }
    catch { return fallback; }
  }

  // [0] Account data (array: totalCollUSD, totalRawCollUSD, totalDebtUSD, availBorrows, healthFactor)
  const acctArr = tryDecode<bigint[]>(POOL_ABI, "getUserAccountData", 0, [0n,0n,0n,0n,0n]);
  const hfRaw       = Number(acctArr[4] ?? 0n) / 1e18;
  const hf          = isFinite(hfRaw) && hfRaw < 10000 ? hfRaw : 999;
  const debtUSD     = Number(acctArr[2] ?? 0n) / 1e18;
  const weightedColl= debtUSD > 0 ? hf * debtUSD : 0;
  const availBorrow = Number(acctArr[3] ?? 0n) / 1e18;

  // [1-3] Reserve data → APY
  const markets = {} as Record<AssetSym, MarketRate>;
  ASSETS.forEach((a, i) => {
    const rd = tryDecode<unknown>(POOL_ABI, "getReserveData", 1 + i, null);
    const rdArr = rd as bigint[] | null;
    const liqRate = rdArr?.[2] ?? (rd as Record<string, bigint> | null)?.currentLiquidityRate ?? 0n;
    const borRate = rdArr?.[3] ?? (rd as Record<string, bigint> | null)?.currentBorrowRate    ?? 0n;
    markets[a.sym] = {
      supplyAPY: Number(liqRate) / 1e27 * 100,
      borrowAPY: Number(borRate) / 1e27 * 100,
    };
  });

  // [4-6] Wallet balances (raw)
  const walletRaw = {} as Record<AssetSym, bigint>;
  ASSETS.forEach((a, i) => { walletRaw[a.sym] = tryDecode<bigint>(ERC20_ABI, "balanceOf", 4 + i, 0n); });

  // [7-9] Supplied balances (raw)
  const suppliedRaw = {} as Record<AssetSym, bigint>;
  ASSETS.forEach((a, i) => { suppliedRaw[a.sym] = tryDecode<bigint>(POOL_ABI, "getUserSupplyBalance", 7 + i, 0n); });

  // [10-12] Borrowed balances (raw)
  const borrowedRaw = {} as Record<AssetSym, bigint>;
  ASSETS.forEach((a, i) => { borrowedRaw[a.sym] = tryDecode<bigint>(POOL_ABI, "getUserBorrowBalance", 10 + i, 0n); });

  // [13-15] Token allowances to executor
  const allowances = {} as Record<AssetSym, bigint>;
  ASSETS.forEach((a, i) => { allowances[a.sym] = tryDecode<bigint>(ERC20_ABI, "allowance", 13 + i, 0n); });

  // [16-17] Real oracle prices (18 dec USD per token)
  const btcPriceRaw  = tryDecode<bigint>(PRICE_ORACLE_ABI, "getPrice", 16, 0n);
  const eurcPriceRaw = tryDecode<bigint>(PRICE_ORACLE_ABI, "getPrice", 17, 0n);
  const btcPriceUSD  = btcPriceRaw  > 0n ? Number(btcPriceRaw)  / 1e18 : 95_000;
  const eurcPriceUSD = eurcPriceRaw > 0n ? Number(eurcPriceRaw) / 1e18 : 1.0;

  const prices: Record<AssetSym, number> = { xUSDC: 1.0, xEURC: eurcPriceUSD, xclrBTC: btcPriceUSD };

  const toUSD = (raw: bigint, sym: AssetSym): number => {
    if (sym === "xclrBTC") return (Number(raw) / 1e8) * prices.xclrBTC;
    return (Number(raw) / 1e6) * prices[sym];
  };

  const wallet   = Object.fromEntries(ASSETS.map(a => [a.sym, toUSD(walletRaw[a.sym],   a.sym)])) as Record<AssetSym, number>;
  const supplied = Object.fromEntries(ASSETS.map(a => [a.sym, toUSD(suppliedRaw[a.sym], a.sym)])) as Record<AssetSym, number>;
  const borrowed = Object.fromEntries(ASSETS.map(a => [a.sym, toUSD(borrowedRaw[a.sym], a.sym)])) as Record<AssetSym, number>;

  const netYieldPerYear = ASSETS.reduce((acc, a) => {
    return acc + supplied[a.sym] * markets[a.sym].supplyAPY / 100
               - borrowed[a.sym] * markets[a.sym].borrowAPY / 100;
  }, 0);

  return {
    hf, debtUSD, weightedCollUSD: weightedColl, availableBorrowsUSD: availBorrow,
    markets, wallet, walletRaw, supplied, suppliedRaw, borrowed, borrowedRaw,
    netYieldPerYear, executorAllowance: allowances.xUSDC, allowances, prices,
  };
}

// ── Rule-based decision ──────────────────────────────────────────────────────

function decideRuleBased(user: UserSub, ctx: PortfolioContext): Decision {
  const { hf, debtUSD, weightedCollUSD, wallet, markets, supplied } = ctx;

  // Priority 1: repay if HF below target
  if (debtUSD > 0 && hf < user.hf_target) {
    const repayUSD = Math.max(0, debtUSD - weightedCollUSD / (user.hf_target + 0.15));
    return { action: "repay", amountUsd: repayUSD, reason: `HF ${hf.toFixed(2)} < target ${user.hf_target} (rule-based)` };
  }

  // Priority 2: supply idle assets — supplying adds collateral so HF only improves.
  // Threshold: above target (not in emergency) is enough to allow supply.
  if (hf > user.hf_target || debtUSD === 0) {
    if (wallet.xUSDC >= 10)   return { action: "supply_usdc",  amountUsd: wallet.xUSDC,   reason: `Idle $${wallet.xUSDC.toFixed(0)} xUSDC, HF safe` };
    if (wallet.xEURC >= 10)   return { action: "supply_eurc",  amountUsd: wallet.xEURC,   reason: `Idle $${wallet.xEURC.toFixed(0)} xEURC, HF safe` };
    if (wallet.xclrBTC >= 10) return { action: "supply_btc",   amountUsd: wallet.xclrBTC, reason: `Idle $${wallet.xclrBTC.toFixed(0)} xclrBTC, HF safe` };
  }

  // Priority 3: rebalance — notify if APY gap > 1% between supplied assets
  const suppliedAssets = ASSETS.filter(a => supplied[a.sym] >= 10);
  if (suppliedAssets.length >= 2) {
    const apys    = suppliedAssets.map(a => markets[a.sym].supplyAPY);
    const apyGap  = Math.max(...apys) - Math.min(...apys);
    if (apyGap >= 1.0) {
      return { action: "rebalance", amountUsd: 0, reason: `APY gap ${apyGap.toFixed(2)}% between supplied assets` };
    }
  }

  return { action: "skip", amountUsd: 0, reason: "No action needed" };
}

// ── LLM decision ─────────────────────────────────────────────────────────────

async function decideLLM(user: UserSub, ctx: PortfolioContext): Promise<Decision> {
  const { hf, debtUSD, weightedCollUSD, availableBorrowsUSD, markets, wallet, supplied, borrowed, netYieldPerYear } = ctx;

  const memUrl = new URL(`${SB_URL}/rest/v1/agent_memory`);
  memUrl.searchParams.set("select", "content");
  memUrl.searchParams.set("wallet_address", `eq.${user.wallet_address}`);
  memUrl.searchParams.set("agent_type", "eq.personal");
  memUrl.searchParams.set("order", "created_at.desc");
  memUrl.searchParams.set("limit", "10");
  const memories: { content: string }[] = await fetch(memUrl.toString(), { headers: SB_HEADERS })
    .then(r => r.json()).catch(() => []);

  const fmt = (n: number) => n.toFixed(2);
  const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const loopNet = (sym: AssetSym) => (markets[sym].supplyAPY - markets[sym].borrowAPY).toFixed(2);

  const { prices } = ctx;
  const cleanMemories = (memories ?? [])
    .map(m => m.content.replace(/→NaN/g, "→unknown").replace(/NaN/g, "?"))
    .filter(c => c.trim().length > 0);

  const prompt = `You are an autonomous DeFi yield optimizer for wallet ${user.wallet_address.slice(0, 10)}...
You manage this wallet 24/7. Make the best risk-adjusted decision RIGHT NOW.

═══ PRICES ═══
xUSDC   = $1.00
xEURC   = $${prices.xEURC.toFixed(4)}
xclrBTC = $${prices.xclrBTC.toLocaleString("en-US", { maximumFractionDigits: 0 })}

═══ MARKET RATES ═══
Asset    │ Supply APY │ Borrow APY │ Net if loop
─────────┼────────────┼────────────┼────────────
xUSDC    │  ${fmt(markets.xUSDC.supplyAPY)}%      │  ${fmt(markets.xUSDC.borrowAPY)}%      │  ${loopNet("xUSDC")}%
xEURC    │  ${fmt(markets.xEURC.supplyAPY)}%      │  ${fmt(markets.xEURC.borrowAPY)}%      │  ${loopNet("xEURC")}%
xclrBTC  │  ${fmt(markets.xclrBTC.supplyAPY)}%      │  ${fmt(markets.xclrBTC.borrowAPY)}%      │  ${loopNet("xclrBTC")}%

═══ POSITION ═══
Health Factor : ${fmt(hf)} (target: ${user.hf_target}, supply threshold: > ${user.hf_target.toFixed(2)})
Total Debt    : ${fmtUSD(debtUSD)}
Collateral    : ${fmtUSD(weightedCollUSD)}
Avail Borrow  : ${fmtUSD(availableBorrowsUSD)}
Net Yield P&L : ${netYieldPerYear >= 0 ? "+" : ""}${fmtUSD(netYieldPerYear)}/yr

═══ WALLET (idle, not earning) ═══
xUSDC   : ${fmtUSD(wallet.xUSDC)}
xEURC   : ${fmtUSD(wallet.xEURC)}
xclrBTC : ${fmtUSD(wallet.xclrBTC)}

═══ POOL POSITIONS ═══
Supplied: xUSDC ${fmtUSD(supplied.xUSDC)} | xEURC ${fmtUSD(supplied.xEURC)} | xclrBTC ${fmtUSD(supplied.xclrBTC)}
Borrowed: xUSDC ${fmtUSD(borrowed.xUSDC)} | xEURC ${fmtUSD(borrowed.xEURC)} | xclrBTC ${fmtUSD(borrowed.xclrBTC)}

═══ RECENT ACTIONS (latest first) ═══
${cleanMemories.length ? cleanMemories.map(c => `- ${c}`).join("\n") : "- No history yet"}

═══ RULES ═══
1. NEVER let HF drop below target + 0.20 after any action
2. Keep wallet reserve = 1.2× amount needed to repay to target from current HF
3. Loop borrow: ONLY suggest (notify_borrow) if net loop > +0.3% AND HF > target + 0.5
4. Supply idle assets if HF > target (supplying adds collateral, HF only improves)
5. If net yield is deeply negative and HF is safe, consider repaying debt

═══ ACTIONS ═══
supply_usdc(amount_usd)     — deploy idle xUSDC to pool
supply_eurc(amount_usd)     — deploy idle xEURC to pool
supply_btc(amount_usd)      — deploy idle xclrBTC to pool
repay(amount_usd)           — repay debt (auto-detects token), improves HF
withdraw_usdc(amount_usd)   — pull xUSDC from pool back to wallet
rebalance                   — notify user to move supply to higher-APY asset
notify_borrow(amount_usd)   — Telegram suggestion to borrow (cannot execute)
skip                        — no action

Respond JSON only: {"action":"...","amount_usd":0,"reason":"..."}`;

  try {
    const resp  = await callLLM(prompt);
    const start = resp.text.indexOf("{");
    const end   = resp.text.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("no JSON");
    const raw = JSON.parse(resp.text.slice(start, end + 1));
    // Normalize snake_case → camelCase (LLM returns amount_usd, interface expects amountUsd)
    const parsed: Decision = {
      action:    raw.action,
      amountUsd: raw.amountUsd ?? raw.amount_usd ?? 0,
      reason:    raw.reason ?? "",
    };
    const validActions: ActionType[] = ["emergency_protect","repay","supply_usdc","supply_eurc","supply_btc","withdraw_usdc","rebalance","notify_borrow","skip"];
    if (!validActions.includes(parsed.action)) throw new Error(`unknown action: ${parsed.action}`);
    return parsed;
  } catch (e) {
    console.warn(`  [llm] parse error: ${(e as Error).message} — falling back to rule-based`);
    return decideRuleBased(user, ctx);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getEnabledUsers(): Promise<UserSub[]> {
  const url = new URL(`${SB_URL}/rest/v1/user_agent_subscriptions`);
  url.searchParams.set("select", "wallet_address,hf_target,enabled,last_llm_call_at,llm_api_key_enc");
  url.searchParams.set("enabled", "eq.true");
  url.searchParams.set("agent_type", "eq.personal");
  const res = await fetch(url.toString(), { headers: SB_HEADERS });
  return res.ok ? res.json() : [];
}

async function getHFBatch(wallets: string[]): Promise<Map<string, { hf: number; debtUSD: number; weightedColl: number }>> {
  if (!wallets.length) return new Map();
  const positions: UserPosition[] = await getPositionsBatch(wallets as `0x${string}`[]);
  const map = new Map<string, { hf: number; debtUSD: number; weightedColl: number }>();
  for (const p of positions) {
    const hfRaw   = Number(p.healthFactor) / 1e18;
    const hf      = isFinite(hfRaw) ? hfRaw : 999;
    const debtUSD = Number(p.totalDebtUSD) / 1e18;
    map.set(p.address.toLowerCase(), { hf, debtUSD, weightedColl: debtUSD > 0 ? hf * debtUSD : 0 });
  }
  return map;
}

function calcRepayAmount(debtUSD: number, weightedColl: number, targetHF: number): bigint {
  const repayUSD = Math.max(0, debtUSD - weightedColl / targetHF);
  return parseUnits(repayUSD.toFixed(6), 6);
}

function shouldCallLLM(user: UserSub): boolean {
  if (!user.last_llm_call_at) return true;
  return Date.now() - new Date(user.last_llm_call_at).getTime() > MIN_LLM_MS;
}

async function updateLastLLMCall(wallet: string) {
  const url = new URL(`${SB_URL}/rest/v1/user_agent_subscriptions`);
  url.searchParams.set("wallet_address", `eq.${wallet}`);
  await fetch(url.toString(), {
    method: "PATCH", headers: SB_HEADERS,
    body: JSON.stringify({ last_llm_call_at: new Date().toISOString() }),
  });
}

async function notifyUser(wallet: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const tgUrl = new URL(`${SB_URL}/rest/v1/telegram_connections`);
  tgUrl.searchParams.set("select", "chat_id");
  tgUrl.searchParams.set("wallet_address", `eq.${wallet}`);
  tgUrl.searchParams.set("limit", "1");
  const rows: { chat_id: string }[] = await fetch(tgUrl.toString(), { headers: SB_HEADERS })
    .then(r => r.json()).catch(() => []);
  if (!rows[0]) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: rows[0].chat_id, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

// Rate limiter for non-critical Telegram notifications (pending approvals, rebalance, etc.)
// Prevents spamming the same event type every 20 blocks.
const notifCooldown = new Map<string, number>(); // key: `${wallet}_${event}` → last sent ms
const NOTIF_COOLDOWN_MS = 30 * 60 * 1000; // 30 min

function canNotify(wallet: string, event: string): boolean {
  const key  = `${wallet}_${event}`;
  const last = notifCooldown.get(key) ?? 0;
  if (Date.now() - last < NOTIF_COOLDOWN_MS) return false;
  notifCooldown.set(key, Date.now());
  return true;
}

async function logAction(wallet: string, action: string, data: {
  reason: string; amountUsd?: number; hfBefore?: number; hfAfter?: number;
  txHash?: string; success: boolean; error?: string;
}) {
  await fetch(`${SB_URL}/rest/v1/agent_actions`, {
    method: "POST", headers: SB_HEADERS,
    body: JSON.stringify({
      wallet_address: wallet, agent_type: "personal",
      action, reason: data.reason, amount_usd: data.amountUsd,
      hf_before: data.hfBefore, hf_after: data.hfAfter,
      success: data.success, tx_hash: data.txHash, error: data.error,
    }),
  }).catch(() => {});
}

async function saveMemory(wallet: string, content: string) {
  await fetch(`${SB_URL}/rest/v1/agent_memory`, {
    method: "POST", headers: SB_HEADERS,
    body: JSON.stringify({ wallet_address: wallet, agent_type: "personal", type: "outcome", content }),
  }).catch(() => {});
}

async function recordReputation(tag: string, score: number) {
  if (DRY_RUN || !AGENT_IDS.PERSONAL_AGENT) return;
  try {
    await deployerWallet.writeContract({
      address: ARC_AGENT_REGISTRY.REPUTATION_REGISTRY, abi: REPUTATION_ABI,
      functionName: "giveFeedback",
      args: [BigInt(AGENT_IDS.PERSONAL_AGENT), BigInt(score), 0, tag, "", "", "", keccak256(toHex(tag))],
    });
  } catch {
    // reputation registry occasionally unavailable — safe to ignore
  }
}

async function readHFAfter(wallet: string): Promise<number> {
  try {
    const data = await publicClient.readContract({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI,
      functionName: "getUserAccountData", args: [wallet as `0x${string}`],
    }) as unknown as bigint[];
    const hfRaw = Number(data[4]) / 1e18;
    return isFinite(hfRaw) && hfRaw < 10000 ? hfRaw : 999;
  } catch { return 0; }
}

// ── Execute helpers ──────────────────────────────────────────────────────────

async function executeRepay(user: UserSub, ctx: PortfolioContext, decision: Decision) {
  const { hf, debtUSD, weightedCollUSD, prices } = ctx;

  if (hf >= user.hf_target + 0.10) {
    console.log(`  [skip] ${user.wallet_address.slice(0,10)}... HF ${hf.toFixed(3)} safe`);
    await logAction(user.wallet_address, "skip", {
      reason: `LLM suggested repay but HF ${hf.toFixed(2)} is already safe (>= target + 0.10)`,
      hfBefore: hf,
      success: true,
    });
    return;
  }

  const repayUSD = Math.max(0, debtUSD - weightedCollUSD / (user.hf_target + 0.15));
  if (repayUSD < 10) {
    console.log(`  [skip] ${user.wallet_address.slice(0,10)}... repay tiny (<$10)`);
    return;
  }

  // Find which token has the most USD debt — repay that one first
  const debtToken = ASSETS
    .map(a => ({ ...a, debtUSD: ctx.borrowed[a.sym], debtRaw: ctx.borrowedRaw[a.sym] }))
    .filter(d => d.debtUSD > 0)
    .sort((a, b) => b.debtUSD - a.debtUSD)[0];

  if (!debtToken) return;

  const tokenDec    = debtToken.sym === "xclrBTC" ? 8 : 6;
  const tokenPrice  = prices[debtToken.sym];
  const repayRaw    = debtToken.sym === "xclrBTC"
    ? parseUnits((repayUSD / tokenPrice).toFixed(8), 8)
    : parseUnits((repayUSD / tokenPrice).toFixed(6), 6);

  const tokenAllowance = ctx.allowances[debtToken.sym];
  const actual         = repayRaw > tokenAllowance ? tokenAllowance : repayRaw;

  if (repayRaw > 0n && Number(actual) / Number(repayRaw) < MIN_COVERAGE) {
    await logAction(user.wallet_address, "skip", { reason: "Insufficient reserve", success: false });
    if (canNotify(user.wallet_address, `low_reserve_${debtToken.sym}`)) {
      await notifyUser(user.wallet_address,
        `⚠️ Agent cannot repay: insufficient ${debtToken.sym} approved.\nNeed $${repayUSD.toFixed(0)}, have ~$${(Number(tokenAllowance) / 10**tokenDec * tokenPrice).toFixed(0)} approved.\nTop up at agentloan.vercel.app`
      );
    }
    return;
  }

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] Would repay ${user.wallet_address.slice(0,10)}... $${(Number(actual)/10**tokenDec*tokenPrice).toFixed(0)} ${debtToken.sym}`);
    return;
  }

  let hash: `0x${string}`;

  if (debtToken.sym === "xUSDC") {
    // xUSDC: repayFromWallet (if wallet has balance) OR emergencyProtect (withdraw supply + repay)
    const walletBal    = ctx.walletRaw.xUSDC;
    const functionName = walletBal >= actual ? "repayFromWallet" : "emergencyProtect";
    hash = await deployerWallet.writeContract({
      address: ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, abi: EXECUTOR_ABI,
      functionName, args: [user.wallet_address as `0x${string}`, actual],
    });
  } else {
    // xEURC / xclrBTC: must repay from wallet (no emergencyProtect equivalent for these)
    const walletBal = ctx.walletRaw[debtToken.sym];
    if (walletBal < actual) {
      if (canNotify(user.wallet_address, `empty_wallet_${debtToken.sym}`)) {
        await notifyUser(user.wallet_address, [
          `⚠️ <b>HF at risk: ${hf.toFixed(2)}</b>`,
          `Need to repay $${repayUSD.toFixed(0)} ${debtToken.sym} but wallet is empty.`,
          `Add ${debtToken.sym} to wallet at agentloan.vercel.app`,
        ].join("\n"));
      }
      await logAction(user.wallet_address, "skip", { reason: `No ${debtToken.sym} in wallet`, success: false });
      return;
    }
    hash = await deployerWallet.writeContract({
      address: ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, abi: EXECUTOR_ABI,
      functionName: "repayTokenFromWallet",
      args: [user.wallet_address as `0x${string}`, debtToken.addr, actual],
    });
  }

  await publicClient.waitForTransactionReceipt({ hash });
  const hfAfter   = await readHFAfter(user.wallet_address);
  const repaidUSD = Number(actual) / 10**tokenDec * tokenPrice;

  await logAction(user.wallet_address, decision.action, {
    reason: decision.reason, amountUsd: repaidUSD, hfBefore: hf, hfAfter, txHash: hash, success: true,
  });
  const hfAfterStr = isFinite(hfAfter) && hfAfter < 999 ? hfAfter.toFixed(2) : "unknown";
  await saveMemory(user.wallet_address,
    `${decision.action}: $${repaidUSD.toFixed(0)} ${debtToken.sym} repaid. HF ${hf.toFixed(2)}→${hfAfterStr}. ${decision.reason}`
  );
  await notifyUser(user.wallet_address, [
    `⚡ <b>Agent protected your position</b>`,
    `Action: Repaid $${repaidUSD.toFixed(0)} ${debtToken.sym}`,
    `HF: ${hf.toFixed(2)} → ${hfAfter.toFixed(2)}`,
    `Reason: ${decision.reason}`,
    `<a href="https://testnet.arcscan.app/tx/${hash}">View TX ↗</a>`,
  ].join("\n"));
  await recordReputation("position_protected", hfAfter > hf ? 95 : 20);
  console.log(`  ✓ ${user.wallet_address.slice(0,10)}... repaid $${repaidUSD.toFixed(0)} ${debtToken.sym}, HF ${hf.toFixed(2)}→${hfAfter.toFixed(2)}`);
}

async function executeSupplyUSDC(user: UserSub, ctx: PortfolioContext, decision: Decision) {
  const { hf } = ctx;

  // Reserve: keep enough in wallet to repay debt back to target+0.30 without touching pool
  const reserveUSD = ctx.debtUSD > 0
    ? Math.max(0, ctx.debtUSD - ctx.weightedCollUSD / (user.hf_target + 0.20)) * 1.2
    : 0;
  const reserveAmount  = parseUnits(Math.ceil(reserveUSD).toFixed(6), 6);
  const deployable     = ctx.walletRaw.xUSDC > reserveAmount ? ctx.walletRaw.xUSDC - reserveAmount : 0n;
  const deployAmount   = deployable < ctx.executorAllowance ? deployable : ctx.executorAllowance;

  if (deployAmount < MIN_SUPPLY) {
    console.log(`  [skip] ${user.wallet_address.slice(0,10)}... supply_usdc deployable $${(Number(deployAmount)/1e6).toFixed(0)} < $10`);
    return;
  }

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] Would supply_usdc ${user.wallet_address.slice(0,10)}... $${(Number(deployAmount)/1e6).toFixed(0)} (reserve kept: $${reserveUSD.toFixed(0)})`);
    return;
  }

  const hash = await deployerWallet.writeContract({
    address: ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, abi: EXECUTOR_ABI,
    functionName: "deployToYield",
    args: [user.wallet_address as `0x${string}`, deployAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  await logAction(user.wallet_address, "supply_usdc", {
    reason: decision.reason, amountUsd: Number(deployAmount)/1e6, hfBefore: hf, hfAfter: hf, txHash: hash, success: true,
  });
  await saveMemory(user.wallet_address,
    `supply_usdc: $${(Number(deployAmount)/1e6).toFixed(0)} deployed. Reserve kept: $${reserveUSD.toFixed(0)}. ${decision.reason}`
  );
  await notifyUser(user.wallet_address, [
    `📈 <b>Agent deployed xUSDC to yield</b>`,
    `Amount: $${(Number(deployAmount)/1e6).toFixed(0)} xUSDC`,
    `APY: ${ctx.markets.xUSDC.supplyAPY.toFixed(2)}%`,
    `Reserve kept in wallet: $${reserveUSD.toFixed(0)}`,
    `<a href="https://testnet.arcscan.app/tx/${hash}">View TX ↗</a>`,
  ].join("\n"));
  await recordReputation("yield_deployed", 80);
  console.log(`  ✓ ${user.wallet_address.slice(0,10)}... supply_usdc $${(Number(deployAmount)/1e6).toFixed(0)}`);
}

async function executeSupplyToken(user: UserSub, ctx: PortfolioContext, decision: Decision, sym: "xEURC" | "xclrBTC") {
  // Phase 2 only — AgentExecutor v2 required
  // For now: notify user to approve token, log as pending
  const assetInfo = ASSETS.find(a => a.sym === sym)!;
  const walletUSD = ctx.wallet[sym];

  if (walletUSD < 10) return;

  // Use allowance already fetched in Multicall3 batch — avoids extra RPC call
  const allowed = ctx.allowances[sym];

  const minAllowance = sym === "xclrBTC"
    ? parseUnits("0.001", 8)
    : parseUnits("1", 6);

  if (allowed < minAllowance) {
    if (canNotify(user.wallet_address, `pending_${sym}`)) {
      await notifyUser(user.wallet_address, [
        `💡 <b>Yield opportunity: ${sym}</b>`,
        `You have $${walletUSD.toFixed(0)} ${sym} idle in wallet`,
        `To supply it: approve ${sym} to agent at agentloan.vercel.app`,
        `APY: ${ctx.markets[sym].supplyAPY.toFixed(2)}%`,
      ].join("\n"));
    }
    await logAction(user.wallet_address, `supply_${sym.toLowerCase().replace("xclr", "").replace("x", "")}`, {
      reason: `Needs ${sym} approval`, success: false, error: "pending_approval",
    });
    console.log(`  [pending] ${user.wallet_address.slice(0,10)}... ${sym} needs approval to supply`);
    return;
  }

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] Would supply_${sym} ${user.wallet_address.slice(0,10)}... $${walletUSD.toFixed(0)}`);
    return;
  }

  // Try deployTokenToYield — will revert if executor is v1 (no such function)
  try {
    const rawAmount = ctx.walletRaw[sym];
    const hash = await deployerWallet.writeContract({
      address: ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, abi: EXECUTOR_ABI,
      functionName: "deployTokenToYield",
      args: [user.wallet_address as `0x${string}`, assetInfo.addr, rawAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    await logAction(user.wallet_address, `supply_${sym.toLowerCase()}`, {
      reason: decision.reason, amountUsd: walletUSD, hfBefore: ctx.hf, hfAfter: ctx.hf, txHash: hash, success: true,
    });
    await saveMemory(user.wallet_address, `supply_${sym}: $${walletUSD.toFixed(0)} deployed. ${decision.reason}`);
    await notifyUser(user.wallet_address, [
      `📈 <b>Agent deployed ${sym} to yield</b>`,
      `Amount: $${walletUSD.toFixed(0)}`,
      `APY: ${ctx.markets[sym].supplyAPY.toFixed(2)}%`,
      `<a href="https://testnet.arcscan.app/tx/${hash}">View TX ↗</a>`,
    ].join("\n"));
    console.log(`  ✓ ${user.wallet_address.slice(0,10)}... supply_${sym} $${walletUSD.toFixed(0)}`);
  } catch (e: any) {
    if (e.message?.includes("function not found") || e.message?.includes("does not exist")) {
      console.log(`  [v1] deployTokenToYield not available — AgentExecutor v2 needed for ${sym}`);
      await notifyUser(user.wallet_address, `💡 Agent wants to supply ${sym} but executor upgrade pending. Check back soon.`);
    } else {
      await logAction(user.wallet_address, `supply_${sym.toLowerCase()}`, {
        reason: decision.reason, success: false, error: e.message?.slice(0, 200),
      });
      console.error(`  ✗ supply_${sym}:`, e.message?.slice(0, 80));
    }
  }
}

async function executeNotifyBorrow(user: UserSub, ctx: PortfolioContext, decision: Decision) {
  const bestAsset = (["xUSDC", "xEURC", "xclrBTC"] as AssetSym[])
    .map(sym => ({ sym, net: ctx.markets[sym].supplyAPY - ctx.markets[sym].borrowAPY }))
    .sort((a, b) => b.net - a.net)[0];

  await notifyUser(user.wallet_address, [
    `💡 <b>Borrow opportunity detected</b>`,
    `Best loop: ${bestAsset.sym} at +${bestAsset.net.toFixed(2)}% net yield`,
    `Available borrow capacity: $${ctx.availableBorrowsUSD.toFixed(0)}`,
    `Your HF: ${ctx.hf.toFixed(2)} (safe buffer: ${(ctx.hf - user.hf_target).toFixed(2)})`,
    ``,
    `To act: borrow ${bestAsset.sym} at agentloan.vercel.app`,
    `(Agent cannot borrow on your behalf — protocol limitation)`,
  ].join("\n"));
  await logAction(user.wallet_address, "notify_borrow", { reason: decision.reason, success: true });
  console.log(`  [notify] ${user.wallet_address.slice(0,10)}... borrow opportunity sent`);
}

async function executeWithdrawUSDC(user: UserSub, ctx: PortfolioContext, decision: Decision) {
  const maxWithdrawUSD = ctx.supplied.xUSDC;
  const withdrawUSD    = Math.min(decision.amountUsd, maxWithdrawUSD);

  if (withdrawUSD < 10) {
    console.log(`  [skip] ${user.wallet_address.slice(0,10)}... withdraw_usdc $${withdrawUSD.toFixed(0)} < $10`);
    return;
  }

  // Safety: ensure HF stays above target after withdrawal (withdrawal reduces collateral)
  if (ctx.debtUSD > 0) {
    const newCollUSD = ctx.weightedCollUSD - withdrawUSD;
    const newHF      = newCollUSD / ctx.debtUSD;
    if (newHF < user.hf_target + 0.20) {
      console.log(`  [skip] ${user.wallet_address.slice(0,10)}... withdraw_usdc would bring HF to ${newHF.toFixed(2)}`);
      return;
    }
  }

  const rawAmount = parseUnits(withdrawUSD.toFixed(6), 6);

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] Would withdraw_usdc ${user.wallet_address.slice(0,10)}... $${withdrawUSD.toFixed(0)}`);
    return;
  }

  const hash = await deployerWallet.writeContract({
    address: ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, abi: EXECUTOR_ABI,
    functionName: "withdrawTokenFromYield",
    args: [user.wallet_address as `0x${string}`, ARC_TESTNET_CONTRACTS.X_USDC, rawAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  await logAction(user.wallet_address, "withdraw_usdc", {
    reason: decision.reason, amountUsd: withdrawUSD, hfBefore: ctx.hf, hfAfter: ctx.hf, txHash: hash, success: true,
  });
  await saveMemory(user.wallet_address, `withdraw_usdc: $${withdrawUSD.toFixed(0)} pulled from pool. ${decision.reason}`);
  await notifyUser(user.wallet_address, [
    `💸 <b>Agent withdrew xUSDC from pool</b>`,
    `Amount: $${withdrawUSD.toFixed(0)} xUSDC`,
    `Reason: ${decision.reason}`,
    `<a href="https://testnet.arcscan.app/tx/${hash}">View TX ↗</a>`,
  ].join("\n"));
  await recordReputation("yield_withdrawn", 70);
  console.log(`  ✓ ${user.wallet_address.slice(0,10)}... withdraw_usdc $${withdrawUSD.toFixed(0)}`);
}

async function executeRebalance(user: UserSub, ctx: PortfolioContext) {
  // Notify user about APY gap between their supplied positions — agent cannot swap tokens
  const suppliedAssets = ASSETS.filter(a => ctx.supplied[a.sym] >= 10);
  if (suppliedAssets.length < 2) return;

  const sorted  = [...suppliedAssets].sort((a, b) => ctx.markets[b.sym].supplyAPY - ctx.markets[a.sym].supplyAPY);
  const best    = sorted[0];
  const worst   = sorted[sorted.length - 1];
  const apyGap  = ctx.markets[best.sym].supplyAPY - ctx.markets[worst.sym].supplyAPY;

  if (apyGap < 1.0) return; // not worth a notification for < 1% gap

  if (!canNotify(user.wallet_address, `rebalance_${worst.sym}_${best.sym}`)) return;

  await notifyUser(user.wallet_address, [
    `📊 <b>Rebalance opportunity</b>`,
    `${worst.sym}: ${ctx.markets[worst.sym].supplyAPY.toFixed(2)}% APY ($${ctx.supplied[worst.sym].toFixed(0)} supplied)`,
    `${best.sym}: ${ctx.markets[best.sym].supplyAPY.toFixed(2)}% APY — ${apyGap.toFixed(2)}% better`,
    ``,
    `Agent cannot swap tokens. To rebalance manually: agentloan.vercel.app`,
  ].join("\n"));

  await logAction(user.wallet_address, "rebalance", {
    reason: `APY gap ${apyGap.toFixed(2)}%: ${worst.sym}→${best.sym}`, success: true,
  });
  console.log(`  [notify] ${user.wallet_address.slice(0,10)}... rebalance ${worst.sym}→${best.sym} +${apyGap.toFixed(2)}%`);
}

// ── Backtest ─────────────────────────────────────────────────────────────────

function runBacktest() {
  console.log("\n════ BACKTEST — 5 scenarios ════\n");

  const mockUser: UserSub = {
    wallet_address: "0xtest000000000000000000000000000000000000",
    hf_target: 1.30, enabled: true, last_llm_call_at: null, llm_api_key_enc: null,
  };

  const baseMarkets: Record<AssetSym, MarketRate> = {
    xUSDC:   { supplyAPY: 0.06, borrowAPY: 2.10 },
    xEURC:   { supplyAPY: 0.00, borrowAPY: 1.40 },
    xclrBTC: { supplyAPY: 0.00, borrowAPY: 3.20 },
  };

  const zeroAssets    = { xUSDC: 0, xEURC: 0, xclrBTC: 0 } as Record<AssetSym, number>;
  const zeroRaw       = { xUSDC: 0n, xEURC: 0n, xclrBTC: 0n } as Record<AssetSym, bigint>;
  const mockAllowances = { xUSDC: 200000_000000n, xEURC: 200000_000000n, xclrBTC: 200000_00000000n } as Record<AssetSym, bigint>;
  const mockPrices     = { xUSDC: 1.0, xEURC: 1.07, xclrBTC: 95_000 } as Record<AssetSym, number>;

  const scenarios: Array<{ name: string; ctx: PortfolioContext; expectedAction: ActionType }> = [
    {
      name: "Scenario 1: HF safe, 110k idle xUSDC — expect supply_usdc",
      ctx: {
        hf: 2.5, debtUSD: 0, weightedCollUSD: 0, availableBorrowsUSD: 50000,
        markets: baseMarkets,
        wallet: { xUSDC: 110000, xEURC: 0, xclrBTC: 0 },
        walletRaw: { xUSDC: 110000_000000n, xEURC: 0n, xclrBTC: 0n },
        supplied: zeroAssets, suppliedRaw: zeroRaw,
        borrowed: zeroAssets, borrowedRaw: zeroRaw,
        netYieldPerYear: 0, executorAllowance: 200000_000000n,
        allowances: mockAllowances, prices: mockPrices,
      },
      expectedAction: "supply_usdc",
    },
    {
      name: "Scenario 2: HF=1.15 < target=1.30, wallet has xUSDC — expect repay",
      ctx: {
        hf: 1.15, debtUSD: 50000, weightedCollUSD: 57500, availableBorrowsUSD: 0,
        markets: baseMarkets,
        wallet: { xUSDC: 10000, xEURC: 0, xclrBTC: 0 },
        walletRaw: { xUSDC: 10000_000000n, xEURC: 0n, xclrBTC: 0n },
        supplied: zeroAssets, suppliedRaw: zeroRaw,
        borrowed: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 },
        borrowedRaw: { xUSDC: 50000_000000n, xEURC: 0n, xclrBTC: 0n },
        netYieldPerYear: -1050, executorAllowance: 200000_000000n,
        allowances: mockAllowances, prices: mockPrices,
      },
      expectedAction: "repay",
    },
    {
      name: "Scenario 3: HF=2.0, supply APY 3% > borrow 2% — expect notify_borrow",
      ctx: {
        hf: 2.0, debtUSD: 20000, weightedCollUSD: 40000, availableBorrowsUSD: 23000,
        markets: { xUSDC: { supplyAPY: 3.0, borrowAPY: 2.0 }, xEURC: baseMarkets.xEURC, xclrBTC: baseMarkets.xclrBTC },
        wallet: zeroAssets, walletRaw: zeroRaw,
        supplied: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 },
        suppliedRaw: { xUSDC: 50000_000000n, xEURC: 0n, xclrBTC: 0n },
        borrowed: { xUSDC: 20000, xEURC: 0, xclrBTC: 0 },
        borrowedRaw: { xUSDC: 20000_000000n, xEURC: 0n, xclrBTC: 0n },
        netYieldPerYear: 1100, executorAllowance: 0n,
        allowances: { xUSDC: 0n, xEURC: 0n, xclrBTC: 0n }, prices: mockPrices,
      },
      expectedAction: "notify_borrow",
    },
    {
      name: "Scenario 4: HF=2.0, APY supply 0.06% < borrow 2.1% — expect skip (no idle funds)",
      ctx: {
        hf: 2.0, debtUSD: 50000, weightedCollUSD: 100000, availableBorrowsUSD: 23000,
        markets: baseMarkets,
        wallet: zeroAssets, walletRaw: zeroRaw,
        supplied: { xUSDC: 110000, xEURC: 0, xclrBTC: 0 },
        suppliedRaw: { xUSDC: 110000_000000n, xEURC: 0n, xclrBTC: 0n },
        borrowed: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 },
        borrowedRaw: { xUSDC: 50000_000000n, xEURC: 0n, xclrBTC: 0n },
        netYieldPerYear: -984, executorAllowance: 0n,
        allowances: { xUSDC: 0n, xEURC: 0n, xclrBTC: 0n }, prices: mockPrices,
      },
      expectedAction: "skip",
    },
    {
      name: "Scenario 5: HF=1.02 emergency, wallet empty — expect emergency_protect",
      ctx: {
        hf: 1.02, debtUSD: 50000, weightedCollUSD: 51000, availableBorrowsUSD: 0,
        markets: baseMarkets,
        wallet: zeroAssets, walletRaw: zeroRaw,
        supplied: { xUSDC: 60000, xEURC: 0, xclrBTC: 0 },
        suppliedRaw: { xUSDC: 60000_000000n, xEURC: 0n, xclrBTC: 0n },
        borrowed: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 },
        borrowedRaw: { xUSDC: 50000_000000n, xEURC: 0n, xclrBTC: 0n },
        netYieldPerYear: -1014, executorAllowance: 0n,
        allowances: { xUSDC: 0n, xEURC: 0n, xclrBTC: 0n }, prices: mockPrices,
      },
      expectedAction: "emergency_protect",
    },
  ];

  let passed = 0;
  for (const s of scenarios) {
    let decision: Decision;
    // Urgency logic mirrors runCycle
    const urgency = s.ctx.debtUSD === 0 ? 0 : (
      s.ctx.hf < 1.05 ? 3 :
      s.ctx.hf < mockUser.hf_target ? 2 :
      s.ctx.hf < mockUser.hf_target + 0.13 ? 1 : 0
    );

    if (urgency >= 3) {
      const repayUSD = Math.max(0, s.ctx.debtUSD - s.ctx.weightedCollUSD / (mockUser.hf_target + 0.2));
      decision = { action: "emergency_protect", amountUsd: repayUSD, reason: "emergency" };
    } else {
      decision = decideRuleBased(mockUser, s.ctx);
      // Override with notify_borrow if loop profitable (simulates LLM)
      const bestNet = Math.max(...(["xUSDC","xEURC","xclrBTC"] as AssetSym[]).map(sym => s.ctx.markets[sym].supplyAPY - s.ctx.markets[sym].borrowAPY));
      if (urgency === 0 && bestNet > 0.3 && s.ctx.hf > mockUser.hf_target + 0.5 && s.ctx.availableBorrowsUSD > 0) {
        decision = { action: "notify_borrow", amountUsd: s.ctx.availableBorrowsUSD, reason: `Net loop +${bestNet.toFixed(2)}%` };
      }
    }

    const ok = decision.action === s.expectedAction;
    const icon = ok ? "✓" : "✗";
    console.log(`  ${icon} ${s.name}`);
    console.log(`    Expected: ${s.expectedAction} | Got: ${decision.action} | Reason: ${decision.reason}`);
    if (ok) passed++;
  }

  console.log(`\n  ${passed}/${scenarios.length} passed`);
  if (passed < scenarios.length) {
    console.error("  BACKTEST FAILED — fix logic before deploying");
    process.exit(1);
  }
  console.log("  BACKTEST PASSED ✓\n");
}

// ── Main execution loop ──────────────────────────────────────────────────────

let isRunning = false;

async function runCycle() {
  const users = await getEnabledUsers();
  console.log(`[cycle] ${new Date().toISOString().slice(11,19)} — ${users.length} user(s)`);
  if (!users.length) return;

  // Quick HF scan via Multicall3 (cheap, no LLM)
  const hfMap = await getHFBatch(users.map(u => u.wallet_address));

  for (const user of users) {
    const quick = hfMap.get(user.wallet_address.toLowerCase());
    if (!quick) continue;

    const urgency = quick.debtUSD === 0 ? 0 : (
      quick.hf < 1.05 ? 3 :
      quick.hf < user.hf_target ? 2 :
      quick.hf < user.hf_target + 0.13 ? 1 : 0
    );

    // Check on-chain authorization
    const authorized = await publicClient.readContract({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI,
      functionName: "agentAuthorized",
      args: [user.wallet_address as `0x${string}`, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR],
    }).catch(() => false);
    if (!authorized) continue;

    // Fetch full portfolio context (all 13 reads in 1 RPC)
    let ctx: PortfolioContext;
    try {
      ctx = await fetchPortfolioContext(user.wallet_address);
    } catch (e: any) {
      console.warn(`  [ctx] failed for ${user.wallet_address.slice(0,10)}...: ${e.message?.slice(0,60)}`);
      continue;
    }

    // Re-check with fresh ctx data
    const hasIdleAssets = ctx.wallet.xUSDC >= 10 || ctx.wallet.xEURC >= 10 || ctx.wallet.xclrBTC >= 10;
    if (urgency === 0 && !hasIdleAssets) continue;

    let decision: Decision;

    if (urgency >= 3) {
      const repayUSD = Math.max(0, ctx.debtUSD - ctx.weightedCollUSD / (user.hf_target + 0.2));
      decision = { action: "emergency_protect", amountUsd: repayUSD, reason: `HF ${ctx.hf.toFixed(2)} < 1.05 — emergency` };
    } else {
      // Rule-based always runs first — handles repay/supply/rebalance instantly without LLM.
      // LLM only fires when rule-based has nothing to do (skip) and cooldown has passed.
      decision = decideRuleBased(user, ctx);

      if (decision.action === "skip") {
        if (shouldCallLLM(user)) {
          decision = await decideLLM(user, ctx);
          await updateLastLLMCall(user.wallet_address);
        }
        // Rule-based doesn't know about borrow opportunities — check manually
        if (decision.action === "skip") {
          const bestNet = Math.max(...(["xUSDC","xEURC","xclrBTC"] as AssetSym[]).map(sym =>
            ctx.markets[sym].supplyAPY - ctx.markets[sym].borrowAPY
          ));
          if (bestNet > 0.3 && ctx.hf > user.hf_target + 0.5 && ctx.availableBorrowsUSD > 1000) {
            decision = { action: "notify_borrow", amountUsd: ctx.availableBorrowsUSD, reason: `Net loop +${bestNet.toFixed(2)}%` };
          }
        }
      }
    }

    if (decision.action === "skip") continue;

    console.log(`  → ${user.wallet_address.slice(0,10)}... ${decision.action} $${decision.amountUsd.toFixed(0)} | ${decision.reason}`);

    try {
      switch (decision.action) {
        case "emergency_protect":
        case "repay":
          await executeRepay(user, ctx, decision);
          break;
        case "supply_usdc":
          await executeSupplyUSDC(user, ctx, decision);
          break;
        case "supply_eurc":
          await executeSupplyToken(user, ctx, decision, "xEURC");
          break;
        case "supply_btc":
          await executeSupplyToken(user, ctx, decision, "xclrBTC");
          break;
        case "notify_borrow":
          await executeNotifyBorrow(user, ctx, decision);
          break;
        case "withdraw_usdc":
          await executeWithdrawUSDC(user, ctx, decision);
          break;
        case "rebalance":
          await executeRebalance(user, ctx);
          break;
      }
    } catch (e: any) {
      await logAction(user.wallet_address, decision.action, {
        reason: decision.reason, success: false, error: e.message?.slice(0, 200),
      });
      console.error(`  ✗ ${user.wallet_address.slice(0,10)}... ${decision.action}:`, e.message?.slice(0, 80));
    }
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

if (BACKTEST) {
  runBacktest();
  process.exit(0);
}

console.log(`Personal Agent v2 starting... DRY_RUN=${DRY_RUN}`);
console.log(`Agent ID: #${AGENT_IDS.PERSONAL_AGENT}`);
console.log(`AgentExecutor: ${ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR}`);
console.log(`Assets: xUSDC | xEURC | xclrBTC`);

let blockCount = 0;
publicClient.watchBlocks({
  onBlock: async () => {
    blockCount++;
    if (blockCount % 20 !== 0) return;
    if (isRunning) return;
    isRunning = true;
    try {
      await runCycle();
    } catch (e: any) {
      console.error("Cycle error:", e.message?.slice(0, 100));
    } finally {
      isRunning = false;
    }
  },
  onError: (e: Error) => console.error("Block watch error:", e.message),
});
