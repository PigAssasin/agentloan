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
const deployerAccount = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
const deployerWallet  = createWalletClient({ account: deployerAccount, chain: arcChain, transport: http() });

const SB_URL     = process.env.SUPABASE_URL!;
const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" };

// ── ABIs ────────────────────────────────────────────────────────────────────

const EXECUTOR_ABI = parseAbi([
  "function emergencyProtect(address user, uint256 repayAmount) external",
  "function repayFromWallet(address user, uint256 repayAmount) external",
  "function deployToYield(address user, uint256 amount) external",
  // v2 — only works after AgentExecutor v2 is deployed
  "function deployTokenToYield(address user, address token, uint256 amount) external",
  "function withdrawTokenFromYield(address user, address token, uint256 amount) external",
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
  borrowed:             Record<AssetSym, number>;   // USD value in pool
  netYieldPerYear:      number;                     // USD/yr (can be negative)
  executorAllowance:    bigint;                     // xUSDC approved to executor
}

type ActionType =
  | "emergency_protect"
  | "repay"
  | "supply_usdc"
  | "supply_eurc"
  | "supply_btc"
  | "withdraw_usdc"
  | "notify_borrow"
  | "skip";

interface Decision {
  action:    ActionType;
  amountUsd: number;
  reason:    string;
}

// ── Portfolio context fetcher ────────────────────────────────────────────────

async function fetchPortfolioContext(walletAddr: string): Promise<PortfolioContext> {
  const w = walletAddr as `0x${string}`;
  const pool = ARC_TESTNET_CONTRACTS.LENDING_POOL;
  const executor = ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR;

  // Build multicall batch: 13 calls, 1 RPC round-trip
  const calls: { target: `0x${string}`; allowFailure: boolean; callData: `0x${string}` }[] = [
    // [0] getUserAccountData
    { target: pool, allowFailure: false, callData: encodeFunctionData({ abi: POOL_ABI, functionName: "getUserAccountData", args: [w] }) },
    // [1-3] getReserveData per asset
    ...ASSETS.map(a => ({ target: pool, allowFailure: true, callData: encodeFunctionData({ abi: POOL_ABI, functionName: "getReserveData", args: [a.addr] }) })),
    // [4-6] walletBalance per asset
    ...ASSETS.map(a => ({ target: a.addr, allowFailure: true, callData: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [w] }) })),
    // [7-9] getUserSupplyBalance per asset
    ...ASSETS.map(a => ({ target: pool, allowFailure: true, callData: encodeFunctionData({ abi: POOL_ABI, functionName: "getUserSupplyBalance", args: [a.addr, w] }) })),
    // [10-12] getUserBorrowBalance per asset
    ...ASSETS.map(a => ({ target: pool, allowFailure: true, callData: encodeFunctionData({ abi: POOL_ABI, functionName: "getUserBorrowBalance", args: [a.addr, w] }) })),
    // [13] xUSDC allowance to executor
    { target: ARC_TESTNET_CONTRACTS.X_USDC, allowFailure: true, callData: encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [w, executor] }) },
  ];

  const results = await publicClient.readContract({
    address: MULTICALL3_ADDR, abi: MULTICALL3_ABI,
    functionName: "aggregate3", args: [calls],
  }) as Array<{ success: boolean; returnData: `0x${string}` }>;

  // [0] Account data
  const acct = decodeFunctionResult({ abi: POOL_ABI, functionName: "getUserAccountData", data: results[0].returnData }) as unknown as {
    totalRawCollateralUSD: bigint; totalDebtUSD: bigint;
    availableBorrowsUSD: bigint; healthFactor: bigint;
  };

  const hf          = Number(acct.healthFactor) / 1e18;
  const debtUSD     = Number(acct.totalDebtUSD) / 1e18;
  const collUSD     = Number(acct.totalRawCollateralUSD) / 1e18;
  const weightedColl= hf * debtUSD;
  const availBorrow = Number(acct.availableBorrowsUSD) / 1e18;

  // [1-3] Reserve data → APY
  const markets = {} as Record<AssetSym, MarketRate>;
  ASSETS.forEach((a, i) => {
    const r = results[1 + i];
    if (!r.success) { markets[a.sym] = { supplyAPY: 0, borrowAPY: 0 }; return; }
    const d = decodeFunctionResult({ abi: POOL_ABI, functionName: "getReserveData", data: r.returnData }) as unknown as {
      currentLiquidityRate: bigint; currentBorrowRate: bigint;
    };
    markets[a.sym] = {
      supplyAPY: Number(d.currentLiquidityRate) / 1e25,  // /1e27 * 100
      borrowAPY: Number(d.currentBorrowRate)    / 1e25,
    };
  });

  // [4-6] Wallet balances — convert to USD (xUSDC/xEURC: 6dec ~$1, xclrBTC: 8dec need price)
  // For xclrBTC price: use simple estimation from pool collateral data
  // BTC price ≈ collateral USD / BTC supplied (rough, good enough for decisions)
  const walletRaw = {} as Record<AssetSym, bigint>;
  ASSETS.forEach((a, i) => {
    const r = results[4 + i];
    walletRaw[a.sym] = r.success
      ? decodeFunctionResult({ abi: ERC20_ABI, functionName: "balanceOf", data: r.returnData }) as bigint
      : 0n;
  });

  // [7-9] Supplied balances
  const suppliedRaw = {} as Record<AssetSym, bigint>;
  ASSETS.forEach((a, i) => {
    const r = results[7 + i];
    suppliedRaw[a.sym] = r.success
      ? decodeFunctionResult({ abi: POOL_ABI, functionName: "getUserSupplyBalance", data: r.returnData }) as bigint
      : 0n;
  });

  // [10-12] Borrowed balances
  const borrowedRaw = {} as Record<AssetSym, bigint>;
  ASSETS.forEach((a, i) => {
    const r = results[10 + i];
    borrowedRaw[a.sym] = r.success
      ? decodeFunctionResult({ abi: POOL_ABI, functionName: "getUserBorrowBalance", data: r.returnData }) as bigint
      : 0n;
  });

  // [13] xUSDC allowance
  const allowanceRaw = results[13].success
    ? decodeFunctionResult({ abi: ERC20_ABI, functionName: "allowance", data: results[13].returnData }) as bigint
    : 0n;

  // Estimate BTC price: if user has xclrBTC in pool, derive from collateral ratio
  // Fallback: read Pyth oracle (simplified — use $95000 if not available)
  let btcPriceUSD = 95_000; // fallback
  try {
    const btcSupplied = Number(suppliedRaw.xclrBTC) / 1e8;
    if (btcSupplied > 0.001) {
      // Use getUserAccountData total collateral vs supplied amounts to estimate
      // This is approximate — good enough for yield decisions
      const usdcSupplied = Number(suppliedRaw.xUSDC) / 1e6;
      const eurcSupplied = Number(suppliedRaw.xEURC) / 1e6;
      const btcCollUSD   = Math.max(0, collUSD - usdcSupplied - eurcSupplied);
      if (btcCollUSD > 0) btcPriceUSD = btcCollUSD / btcSupplied;
    }
  } catch { /* use fallback */ }

  // Convert to USD
  const toUSD = (raw: bigint, sym: AssetSym): number => {
    if (sym === "xclrBTC") return (Number(raw) / 1e8) * btcPriceUSD;
    return Number(raw) / 1e6; // 6 dec stables ~$1
  };

  const wallet   = Object.fromEntries(ASSETS.map(a => [a.sym, toUSD(walletRaw[a.sym], a.sym)])) as Record<AssetSym, number>;
  const supplied = Object.fromEntries(ASSETS.map(a => [a.sym, toUSD(suppliedRaw[a.sym], a.sym)])) as Record<AssetSym, number>;
  const borrowed = Object.fromEntries(ASSETS.map(a => [a.sym, toUSD(borrowedRaw[a.sym], a.sym)])) as Record<AssetSym, number>;

  // Net yield P&L per year
  const netYieldPerYear =
    ASSETS.reduce((acc, a) => {
      const earn = supplied[a.sym] * markets[a.sym].supplyAPY / 100;
      const cost = borrowed[a.sym] * markets[a.sym].borrowAPY / 100;
      return acc + earn - cost;
    }, 0);

  return {
    hf, debtUSD, weightedCollUSD: weightedColl, availableBorrowsUSD: availBorrow,
    markets, wallet, walletRaw, supplied, borrowed,
    netYieldPerYear, executorAllowance: allowanceRaw,
  };
}

// ── Rule-based decision ──────────────────────────────────────────────────────

function decideRuleBased(user: UserSub, ctx: PortfolioContext): Decision {
  const { hf, debtUSD, weightedCollUSD, wallet, markets } = ctx;

  // Priority 1: repay if HF below target
  if (debtUSD > 0 && hf < user.hf_target) {
    const repayUSD = Math.max(0, debtUSD - weightedCollUSD / (user.hf_target + 0.15));
    return { action: "repay", amountUsd: repayUSD, reason: `HF ${hf.toFixed(2)} < target ${user.hf_target} (rule-based)` };
  }

  // Priority 2: supply idle assets when HF is safe (or no debt)
  if (hf > user.hf_target + 0.3 || debtUSD === 0) {
    if (wallet.xUSDC >= 10)   return { action: "supply_usdc",  amountUsd: wallet.xUSDC,   reason: `Idle $${wallet.xUSDC.toFixed(0)} xUSDC, HF safe` };
    if (wallet.xEURC >= 10)   return { action: "supply_eurc",  amountUsd: wallet.xEURC,   reason: `Idle $${wallet.xEURC.toFixed(0)} xEURC, HF safe` };
    if (wallet.xclrBTC >= 10) return { action: "supply_btc",   amountUsd: wallet.xclrBTC, reason: `Idle $${wallet.xclrBTC.toFixed(0)} xclrBTC, HF safe` };
  }

  return { action: "skip", amountUsd: 0, reason: "No action needed" };
}

// ── LLM decision ─────────────────────────────────────────────────────────────

async function decideLLM(user: UserSub, ctx: PortfolioContext): Promise<Decision> {
  const { hf, debtUSD, weightedCollUSD, availableBorrowsUSD, markets, wallet, supplied, borrowed, netYieldPerYear } = ctx;

  const memUrl = new URL(`${SB_URL}/rest/v1/agent_memory`);
  memUrl.searchParams.set("select", "content");
  memUrl.searchParams.set("wallet_address", `eq.${user.wallet_address}`);
  memUrl.searchParams.set("order", "created_at.desc");
  memUrl.searchParams.set("limit", "10");
  const memories: { content: string }[] = await fetch(memUrl.toString(), { headers: SB_HEADERS })
    .then(r => r.json()).catch(() => []);

  const fmt = (n: number) => n.toFixed(2);
  const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const loopNet = (sym: AssetSym) => (markets[sym].supplyAPY - markets[sym].borrowAPY).toFixed(2);

  const prompt = `You are an autonomous DeFi yield optimizer for wallet ${user.wallet_address.slice(0, 10)}...
You manage this wallet 24/7. Make the best risk-adjusted decision RIGHT NOW.

═══ MARKET RATES ═══
Asset    │ Supply APY │ Borrow APY │ Net if loop
─────────┼────────────┼────────────┼────────────
xUSDC    │  ${fmt(markets.xUSDC.supplyAPY)}%      │  ${fmt(markets.xUSDC.borrowAPY)}%      │  ${loopNet("xUSDC")}%
xEURC    │  ${fmt(markets.xEURC.supplyAPY)}%      │  ${fmt(markets.xEURC.borrowAPY)}%      │  ${loopNet("xEURC")}%
xclrBTC  │  ${fmt(markets.xclrBTC.supplyAPY)}%      │  ${fmt(markets.xclrBTC.borrowAPY)}%      │  ${loopNet("xclrBTC")}%

═══ POSITION ═══
Health Factor : ${fmt(hf)} (target: ${user.hf_target}, safe zone: > ${(user.hf_target + 0.3).toFixed(2)})
Total Debt    : ${fmtUSD(debtUSD)}
Collateral    : ${fmtUSD(weightedCollUSD)}
Avail Borrow  : ${fmtUSD(availableBorrowsUSD)}
Net Yield P&L : ${netYieldPerYear >= 0 ? "+" : ""}${fmtUSD(netYieldPerYear)}/yr

═══ WALLET (idle, not earning) ═══
xUSDC   : ${fmtUSD(wallet.xUSDC)}
xEURC   : ${fmtUSD(wallet.xEURC)}
xclrBTC : ${fmtUSD(wallet.xclrBTC)}

═══ POOL POSITIONS ═══
Supplied: xUSDC ${fmtUSD(supplied.xUSDC)} | xEURC ${fmtUSD(supplied.xEURC)} | xclrBTC ${fmtUSD(wallet.xclrBTC)}
Borrowed: xUSDC ${fmtUSD(borrowed.xUSDC)} | xEURC ${fmtUSD(borrowed.xEURC)} | xclrBTC ${fmtUSD(borrowed.xclrBTC)}

═══ MEMORY ═══
${(memories ?? []).map(m => `- ${m.content}`).join("\n") || "- No history yet"}

═══ RULES ═══
1. NEVER let HF drop below target + 0.20 after any action
2. Keep wallet reserve = 1.2× amount needed to repay to target from current HF
3. Loop borrow: ONLY suggest (notify_borrow) if net loop > +0.3% AND HF > target + 0.5
4. Supply idle assets if HF > target + 0.3 (even at 0% APY beats doing nothing)
5. If net yield is deeply negative and HF is safe, consider repaying debt

═══ ACTIONS ═══
supply_usdc(amount_usd)     — deploy idle xUSDC to pool
supply_eurc(amount_usd)     — deploy idle xEURC to pool
supply_btc(amount_usd)      — deploy idle xclrBTC to pool
repay(amount_usd)           — repay xUSDC debt, improves HF
withdraw_usdc(amount_usd)   — pull xUSDC from pool back to wallet
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
    const validActions: ActionType[] = ["emergency_protect","repay","supply_usdc","supply_eurc","supply_btc","withdraw_usdc","notify_borrow","skip"];
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
    const hf      = Number(p.healthFactor) / 1e18;
    const debtUSD = Number(p.totalDebtUSD) / 1e18;
    map.set(p.address.toLowerCase(), { hf, debtUSD, weightedColl: hf * debtUSD });
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
  } catch (e) {
    console.warn("    [reputation] failed:", (e as Error).message?.slice(0, 60));
  }
}

async function readHFAfter(wallet: string): Promise<number> {
  try {
    const data = await publicClient.readContract({
      address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI,
      functionName: "getUserAccountData", args: [wallet as `0x${string}`],
    }) as unknown as { healthFactor: bigint };
    return Number(data.healthFactor) / 1e18;
  } catch { return 0; }
}

// ── Execute helpers ──────────────────────────────────────────────────────────

async function executeRepay(user: UserSub, ctx: PortfolioContext, decision: Decision) {
  const { hf, debtUSD, weightedCollUSD } = ctx;
  const repayAmount = calcRepayAmount(debtUSD, weightedCollUSD, user.hf_target + 0.15);

  if (hf >= user.hf_target + 0.10 || repayAmount < parseUnits("10", 6)) {
    console.log(`  [skip] ${user.wallet_address.slice(0,10)}... HF ${hf.toFixed(3)} safe or repay tiny`);
    return;
  }

  const walletBal = ctx.walletRaw.xUSDC;
  const actual    = repayAmount > ctx.executorAllowance ? ctx.executorAllowance : repayAmount;

  if (repayAmount > 0n && Number(actual) / Number(repayAmount) < MIN_COVERAGE) {
    await logAction(user.wallet_address, "skip", { reason: "Insufficient reserve", success: false });
    await notifyUser(user.wallet_address,
      `⚠️ Agent cannot act: insufficient reserve.\nNeed $${decision.amountUsd.toFixed(0)}, have $${(Number(ctx.executorAllowance)/1e6).toFixed(0)} approved.\nTop up at agentloan.vercel.app`
    );
    return;
  }

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] Would repay ${user.wallet_address.slice(0,10)}... $${(Number(actual)/1e6).toFixed(0)}`);
    return;
  }

  const functionName = walletBal >= actual ? "repayFromWallet" : "emergencyProtect";
  const hash = await deployerWallet.writeContract({
    address: ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR, abi: EXECUTOR_ABI,
    functionName, args: [user.wallet_address as `0x${string}`, actual],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  const hfAfter = await readHFAfter(user.wallet_address);

  await logAction(user.wallet_address, decision.action, {
    reason: decision.reason, amountUsd: Number(actual)/1e6,
    hfBefore: hf, hfAfter, txHash: hash, success: true,
  });
  await saveMemory(user.wallet_address,
    `${decision.action}: $${(Number(actual)/1e6).toFixed(0)} repaid. HF ${hf.toFixed(2)}→${hfAfter.toFixed(2)}. ${decision.reason}`
  );
  await notifyUser(user.wallet_address, [
    `⚡ <b>Agent protected your position</b>`,
    `Action: Repaid $${(Number(actual)/1e6).toFixed(0)} xUSDC`,
    `HF: ${hf.toFixed(2)} → ${hfAfter.toFixed(2)}`,
    `Reason: ${decision.reason}`,
    `<a href="https://testnet.arcscan.app/tx/${hash}">View TX ↗</a>`,
  ].join("\n"));
  await recordReputation("position_protected", hfAfter > hf ? 95 : 20);
  console.log(`  ✓ ${user.wallet_address.slice(0,10)}... repaid $${(Number(actual)/1e6).toFixed(0)}, HF ${hf.toFixed(2)}→${hfAfter.toFixed(2)}`);
}

async function executeSupplyUSDC(user: UserSub, ctx: PortfolioContext, decision: Decision) {
  const { hf } = ctx;

  // Reserve: keep enough in wallet to repay debt back to target+0.30 without touching pool
  const reserveUSD = ctx.debtUSD > 0
    ? Math.max(0, ctx.debtUSD - ctx.weightedCollUSD / (user.hf_target + 0.30)) * 1.2
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

  // Check if user has approved this token to executor
  const allowed = await publicClient.readContract({
    address: assetInfo.addr, abi: ERC20_ABI,
    functionName: "allowance",
    args: [user.wallet_address as `0x${string}`, ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR],
  }) as bigint;

  const minAllowance = sym === "xclrBTC"
    ? parseUnits("0.001", 8)
    : parseUnits("1", 6);

  if (allowed < minAllowance) {
    // Notify user to approve — don't fail silently
    await notifyUser(user.wallet_address, [
      `💡 <b>Yield opportunity: ${sym}</b>`,
      `You have $${walletUSD.toFixed(0)} ${sym} idle in wallet`,
      `To supply it: approve ${sym} to agent at agentloan.vercel.app`,
      `APY: ${ctx.markets[sym].supplyAPY.toFixed(2)}%`,
    ].join("\n"));
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

  const zeroAssets = { xUSDC: 0, xEURC: 0, xclrBTC: 0 } as Record<AssetSym, number>;
  const zeroRaw    = { xUSDC: 0n, xEURC: 0n, xclrBTC: 0n } as Record<AssetSym, bigint>;

  const scenarios: Array<{ name: string; ctx: PortfolioContext; expectedAction: ActionType }> = [
    {
      name: "Scenario 1: HF safe, 110k idle xUSDC — expect supply_usdc",
      ctx: {
        hf: 2.5, debtUSD: 0, weightedCollUSD: 0, availableBorrowsUSD: 50000,
        markets: baseMarkets,
        wallet: { xUSDC: 110000, xEURC: 0, xclrBTC: 0 },
        walletRaw: { xUSDC: 110000_000000n, xEURC: 0n, xclrBTC: 0n },
        supplied: zeroAssets, borrowed: zeroAssets,
        netYieldPerYear: 0, executorAllowance: 200000_000000n,
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
        supplied: zeroAssets, borrowed: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 },
        netYieldPerYear: -1050, executorAllowance: 200000_000000n,
      },
      expectedAction: "repay",
    },
    {
      name: "Scenario 3: HF=2.0, supply APY 3% > borrow 2% — expect notify_borrow",
      ctx: {
        hf: 2.0, debtUSD: 20000, weightedCollUSD: 40000, availableBorrowsUSD: 23000,
        markets: { xUSDC: { supplyAPY: 3.0, borrowAPY: 2.0 }, xEURC: baseMarkets.xEURC, xclrBTC: baseMarkets.xclrBTC },
        wallet: zeroAssets, walletRaw: zeroRaw,
        supplied: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 }, borrowed: { xUSDC: 20000, xEURC: 0, xclrBTC: 0 },
        netYieldPerYear: 1100, executorAllowance: 0n,
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
        borrowed: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 },
        netYieldPerYear: -984, executorAllowance: 0n,
      },
      expectedAction: "skip",
    },
    {
      name: "Scenario 5: HF=1.02 emergency, wallet rỗng — expect emergency_protect",
      ctx: {
        hf: 1.02, debtUSD: 50000, weightedCollUSD: 51000, availableBorrowsUSD: 0,
        markets: baseMarkets,
        wallet: zeroAssets, walletRaw: zeroRaw,
        supplied: { xUSDC: 60000, xEURC: 0, xclrBTC: 0 },
        borrowed: { xUSDC: 50000, xEURC: 0, xclrBTC: 0 },
        netYieldPerYear: -1014, executorAllowance: 0n,
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
    } else if (shouldCallLLM(user)) {
      decision = await decideLLM(user, ctx);
      await updateLastLLMCall(user.wallet_address);
    } else {
      decision = decideRuleBased(user, ctx);
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
          // Phase 2 only
          console.log(`  [v2-pending] withdraw_usdc requires AgentExecutor v2`);
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
