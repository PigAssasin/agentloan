import { NextRequest }                                    from "next/server";
import { createPublicClient, http, parseAbi, encodeFunctionData, decodeFunctionResult } from "viem";
import { ARC_TESTNET_CONTRACTS }                          from "../../../../../config/contracts";
import { supabaseAdmin }                                  from "@/lib/supabase";

const arcChain = {
  id:             5042002,
  name:           "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls:        { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const client = createPublicClient({ chain: arcChain, transport: http() });

const POOL_ABI = parseAbi([
  "function getUserAccountData(address) external view returns (uint256,uint256,uint256,uint256,uint256)",
  "function agentAuthorized(address,address) external view returns (bool)",
  "function getUserSupplyBalance(address token, address user) external view returns (uint256)",
  "function getUserBorrowBalance(address token, address user) external view returns (uint256)",
  "function getReserveData(address) external view returns (uint128 liquidityIndex, uint128 borrowIndex, uint128 currentLiquidityRate, uint128 currentBorrowRate, uint32 lastUpdateTimestamp, uint8 decimals, bool borrowingEnabled, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint128 totalScaledSupply, uint128 totalScaledBorrow, uint256 supplyCap)",
]);

const ERC20_ABI = parseAbi([
  "function allowance(address,address) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)",
]);

const MULTICALL3_ABI = [{
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
}] as const;

const ASSETS = [
  { sym: "xUSDC",   addr: ARC_TESTNET_CONTRACTS.X_USDC,    dec: 6 },
  { sym: "xEURC",   addr: ARC_TESTNET_CONTRACTS.X_EURC,    dec: 6 },
  { sym: "xclrBTC", addr: ARC_TESTNET_CONTRACTS.X_CLR_BTC, dec: 8 },
] as const;

type Sym = "xUSDC" | "xEURC" | "xclrBTC";

function enc(abi: readonly unknown[], fn: string, args: unknown[]) {
  return encodeFunctionData({ abi: abi as Parameters<typeof encodeFunctionData>[0]["abi"], functionName: fn, args } as Parameters<typeof encodeFunctionData>[0]);
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase() as `0x${string}` | null;
  if (!address) return Response.json({ error: "address required" }, { status: 400 });

  try {
    const pool     = ARC_TESTNET_CONTRACTS.LENDING_POOL;
    const executor = ARC_TESTNET_CONTRACTS.AGENT_EXECUTOR;

    // Build 19-call Multicall3 batch
    // [0] getUserAccountData
    // [1-3] getReserveData per asset
    // [4-6] getUserSupplyBalance per asset
    // [7-9] getUserBorrowBalance per asset
    // [10-12] balanceOf per asset (wallet)
    // [13] agentAuthorized
    // [14-16] allowance per asset

    const calls = [
      { target: pool,     allowFailure: false, callData: enc(POOL_ABI,  "getUserAccountData",   [address]) },
      ...ASSETS.map(a => ({ target: pool, allowFailure: false, callData: enc(POOL_ABI, "getReserveData",    [a.addr]) })),
      ...ASSETS.map(a => ({ target: pool, allowFailure: false, callData: enc(POOL_ABI, "getUserSupplyBalance", [a.addr, address]) })),
      ...ASSETS.map(a => ({ target: pool, allowFailure: false, callData: enc(POOL_ABI, "getUserBorrowBalance", [a.addr, address]) })),
      ...ASSETS.map(a => ({ target: a.addr as `0x${string}`, allowFailure: false, callData: enc(ERC20_ABI, "balanceOf", [address]) })),
      { target: pool,     allowFailure: false, callData: enc(POOL_ABI,  "agentAuthorized",      [address, executor]) },
      ...ASSETS.map(a => ({ target: a.addr as `0x${string}`, allowFailure: false, callData: enc(ERC20_ABI, "allowance", [address, executor]) })),
    ];

    const results = await client.readContract({
      address:      ARC_TESTNET_CONTRACTS.MULTICALL3,
      abi:          MULTICALL3_ABI,
      functionName: "aggregate3",
      args:         [calls],
    }) as { success: boolean; returnData: `0x${string}` }[];

    let i = 0;
    function dec(abi: readonly unknown[], fn: string) {
      return decodeFunctionResult({ abi: abi as Parameters<typeof decodeFunctionResult>[0]["abi"], functionName: fn, data: results[i++].returnData });
    }

    // [0] Account data
    const [totalCollUSD, , totalDebtUSD, , healthFactor] = dec(POOL_ABI, "getUserAccountData") as bigint[];

    // [1-3] Reserve data → APY
    // getReserveData has named returns, but via type-erased ABI viem may return an array.
    // Index 2 = currentLiquidityRate, index 3 = currentBorrowRate (per ABI definition order).
    const markets: Record<Sym, { supplyAPY: number; borrowAPY: number }> = {} as never;
    for (const a of ASSETS) {
      const rd = dec(POOL_ABI, "getReserveData") as unknown;
      const rdArr = rd as bigint[];
      const liqRate  = rdArr[2] ?? (rd as Record<string, bigint>).currentLiquidityRate ?? 0n;
      const borRate  = rdArr[3] ?? (rd as Record<string, bigint>).currentBorrowRate    ?? 0n;
      markets[a.sym as Sym] = {
        supplyAPY: Number(liqRate) / 1e27 * 100,
        borrowAPY: Number(borRate) / 1e27 * 100,
      };
    }

    // [4-6] Supply balances
    const supplied: Record<Sym, number> = {} as never;
    for (const a of ASSETS) {
      const raw = dec(POOL_ABI, "getUserSupplyBalance") as bigint;
      supplied[a.sym as Sym] = Number(raw) / 10 ** a.dec;
    }

    // [7-9] Borrow balances
    const borrowed: Record<Sym, number> = {} as never;
    for (const a of ASSETS) {
      const raw = dec(POOL_ABI, "getUserBorrowBalance") as bigint;
      borrowed[a.sym as Sym] = Number(raw) / 10 ** a.dec;
    }

    // [10-12] Wallet balances
    const wallet: Record<Sym, number> = {} as never;
    for (const a of ASSETS) {
      const raw = dec(ERC20_ABI, "balanceOf") as bigint;
      wallet[a.sym as Sym] = Number(raw) / 10 ** a.dec;
    }

    // [13] Agent authorized
    const isAuthorized = dec(POOL_ABI, "agentAuthorized") as boolean;

    // [14-16] Allowances
    const allowances: Record<Sym, bigint> = {} as never;
    for (const a of ASSETS) {
      allowances[a.sym as Sym] = dec(ERC20_ABI, "allowance") as bigint;
    }

    // Derived: net yield per year (USD)
    const netYieldPerYear = (["xUSDC", "xEURC", "xclrBTC"] as Sym[]).reduce((sum, sym) => {
      const m = markets[sym];
      return sum + supplied[sym] * m.supplyAPY / 100 - borrowed[sym] * m.borrowAPY / 100;
    }, 0);

    // Derived: approvedAmount (xUSDC backward compat)
    const xUSDCAllowance = allowances.xUSDC;
    const approvedAmount = xUSDCAllowance > 2n ** 128n
      ? "unlimited"
      : (Number(xUSDCAllowance) / 1e6).toFixed(2);

    // needsTokenApproval: which tokens have 0 allowance
    const needsTokenApproval = (["xUSDC", "xEURC", "xclrBTC"] as Sym[]).filter(
      sym => allowances[sym] === 0n
    );

    const hfRaw = Number(healthFactor) / 1e18;
    const hf    = isFinite(hfRaw) && hfRaw < 10000 ? hfRaw : 999;

    const { data: tg } = await supabaseAdmin
      .from("telegram_connections")
      .select("chat_id")
      .eq("wallet_address", address)
      .single();

    return Response.json({
      // legacy fields (backward compat)
      healthFactor:   hf.toFixed(4),
      totalCollUSD:   (Number(totalCollUSD) / 1e18).toFixed(2),
      totalDebtUSD:   (Number(totalDebtUSD) / 1e18).toFixed(2),
      isAuthorized,
      approvedAmount,
      hasTelegram:    !!tg?.chat_id,
      // new fields (Phase 3)
      markets,
      supplied,
      borrowed,
      wallet,
      netYieldPerYear: netYieldPerYear.toFixed(4),
      needsTokenApproval,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
