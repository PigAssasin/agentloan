"use client";

import { useReadContract, useReadContracts, useAccount } from "wagmi";
import { formatUnits } from "viem";
import LendingPoolABI   from "@/lib/abi-lending-pool.json";
import PriceOracleABI   from "@/lib/abi-price-oracle.json";
import { ARC_TESTNET_CONTRACTS } from "../../config/contracts";

const POOL   = ARC_TESTNET_CONTRACTS.LENDING_POOL;
const ORACLE = ARC_TESTNET_CONTRACTS.PRICE_ORACLE;

// Format USD without locale dependency (no toLocaleString)
export function fmtUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export const TOKENS = {
  xUSDC:   { address: ARC_TESTNET_CONTRACTS.X_USDC,    decimals: 6, symbol: "xUSDC",   name: "Arc Testnet USD",  borrowable: true  },
  xEURC:   { address: ARC_TESTNET_CONTRACTS.X_EURC,    decimals: 6, symbol: "xEURC",   name: "Arc Testnet Euro", borrowable: false },
  xclrBTC: { address: ARC_TESTNET_CONTRACTS.X_CLR_BTC, decimals: 8, symbol: "xclrBTC", name: "Arc Testnet BTC",  borrowable: false },
} as const;

export type TokenSymbol = keyof typeof TOKENS;

const RAY  = 10n ** 27n;
const WAD  = 10n ** 18n;
const YEAR = 31_536_000n; // seconds

function rayToApy(rate: bigint): number {
  if (rate === 0n) return 0;
  // APY % = (rate / RAY) * 100
  return Number((rate * 10000n) / RAY) / 100;
}

// ── User account summary ───────────────────────────────────────────────────

export function useUserAccountData() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: POOL,
    abi: LendingPoolABI,
    functionName: "getUserAccountData",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 3_000, refetchOnWindowFocus: true },
  });

  const raw = data as {
    totalCollateralUSD: bigint;
    totalRawCollateralUSD: bigint;
    totalDebtUSD: bigint;
    availableBorrowsUSD: bigint;
    healthFactor: bigint;
    weightedLtv: bigint;
    weightedLiquidationThreshold: bigint;
  } | undefined;

  const MAX_HF = 2n ** 256n - 1n;

  // Default to MAX_HF when data not yet loaded — avoids false "LIQUIDATABLE" flash
  const hfRaw = raw?.healthFactor ?? MAX_HF;
  const healthFactor: string =
    hfRaw === MAX_HF
      ? "∞"
      : (Number(hfRaw * 100n / WAD) / 100).toFixed(2);

  return {
    totalCollateralUSD: raw ? Number(formatUnits(raw.totalRawCollateralUSD, 18)) : 0,
    totalWeightedCollateralUSD: raw ? Number(formatUnits(raw.totalCollateralUSD, 18)) : 0,
    totalDebtUSD:       raw ? Number(formatUnits(raw.totalDebtUSD, 18))       : 0,
    availableBorrows:   raw ? Number(formatUnits(raw.availableBorrowsUSD, 18)): 0,
    healthFactor,
    healthFactorRaw:    hfRaw,
    isLoading,
    refetch,
  };
}

// ── Per-token user supply & borrow balances ───────────────────────────────

export function useUserTokenBalances() {
  const { address } = useAccount();
  const tokenList = Object.values(TOKENS);

  const supplyContracts = tokenList.map(t => ({
    address: POOL,
    abi: LendingPoolABI as any,
    functionName: "getUserSupplyBalance" as const,
    args: address ? [t.address, address] : undefined,
  }));

  const borrowContracts = tokenList.map(t => ({
    address: POOL,
    abi: LendingPoolABI as any,
    functionName: "getUserBorrowBalance" as const,
    args: address ? [t.address, address] : undefined,
  }));

  const { data: supplyData, refetch: refetchSupply } = useReadContracts({
    contracts: supplyContracts,
    query: { enabled: !!address, refetchInterval: 3_000, refetchOnWindowFocus: true },
  });

  const { data: borrowData, refetch: refetchBorrow } = useReadContracts({
    contracts: borrowContracts,
    query: { enabled: !!address, refetchInterval: 3_000, refetchOnWindowFocus: true },
  });

  const refetch = () => { refetchSupply(); refetchBorrow(); };

  return {
    supply: Object.fromEntries(
      tokenList.map((t, i) => [
        t.symbol,
        Number(formatUnits((supplyData?.[i]?.result as bigint) ?? 0n, t.decimals)),
      ])
    ) as Record<TokenSymbol, number>,
    borrow: Object.fromEntries(
      tokenList.map((t, i) => [
        t.symbol,
        Number(formatUnits((borrowData?.[i]?.result as bigint) ?? 0n, t.decimals)),
      ])
    ) as Record<TokenSymbol, number>,
    refetch,
  };
}

// ── Reserve data (APY, utilization, pool totals + USD values) ────────────

export function useReserveData() {
  const tokenList = Object.values(TOKENS);

  const reserveContracts = tokenList.map(t => ({
    address: POOL,
    abi: LendingPoolABI as any,
    functionName: "getReserveData" as const,
    args: [t.address],
  }));

  const priceContracts = tokenList.map(t => ({
    address: ORACLE,
    abi: PriceOracleABI as any,
    functionName: "getPrice" as const,
    args: [t.address],
  }));

  const { data,       isLoading, refetch: refetchReserves } = useReadContracts({
    contracts: reserveContracts,
    query: { refetchInterval: 4_000, refetchOnWindowFocus: true, placeholderData: (prev: any) => prev },
  });

  const { data: priceData, refetch: refetchPrices } = useReadContracts({
    contracts: priceContracts,
    query: { refetchInterval: 30_000, placeholderData: (prev: any) => prev },
  });

  const refetch = () => { refetchReserves(); refetchPrices(); };

  return {
    reserves: Object.fromEntries(
      tokenList.map((t, i) => {
        const r         = data?.[i]?.result as any;
        const priceWAD  = (priceData?.[i]?.result as bigint) ?? 0n;
        const priceUSD  = priceWAD > 0n ? Number(formatUnits(priceWAD, 18)) : 1; // fallback $1

        // Compute real totals from scaled × index / RAY
        const rayBig = 10n ** 27n;
        const liquidityIndex: bigint = r ? BigInt(r.liquidityIndex) : rayBig;
        const borrowIndex: bigint    = r ? BigInt(r.borrowIndex)    : rayBig;
        const scaledSupply: bigint   = r ? BigInt(r.totalScaledSupply) : 0n;
        const scaledBorrow: bigint   = r ? BigInt(r.totalScaledBorrow) : 0n;
        const realSupplyRaw = scaledSupply > 0n ? (scaledSupply * liquidityIndex) / rayBig : 0n;
        const realBorrowRaw = scaledBorrow > 0n ? (scaledBorrow * borrowIndex)    / rayBig : 0n;
        const totalSupplied    = r ? Number(formatUnits(realSupplyRaw, t.decimals)) : 0;
        const totalBorrowed    = r ? Number(formatUnits(realBorrowRaw, t.decimals)) : 0;
        const totalSuppliedUSD = totalSupplied * priceUSD;
        const totalBorrowedUSD = totalBorrowed * priceUSD;
        const utilization      = totalSupplied > 0 ? (totalBorrowed / totalSupplied) * 100 : 0;
        const supplyApy        = r ? rayToApy(BigInt(r.currentLiquidityRate)) : 0;
        const borrowApy        = r ? rayToApy(BigInt(r.currentBorrowRate))    : 0;

        return [t.symbol, {
          totalSupplied, totalBorrowed,
          totalSuppliedUSD, totalBorrowedUSD,
          utilization, supplyApy, borrowApy, priceUSD,
        }];
      })
    ) as Record<TokenSymbol, {
      totalSupplied: number;    totalBorrowed: number;
      totalSuppliedUSD: number; totalBorrowedUSD: number;
      utilization: number;      supplyApy: number;
      borrowApy: number;        priceUSD: number;
    }>,
    isLoading,
    refetch,
  };
}

// ── ERC20 wallet balances ─────────────────────────────────────────────────

export function useWalletBalances() {
  const { address } = useAccount();
  const tokenList = Object.values(TOKENS);

  const contracts = tokenList.map(t => ({
    address: t.address,
    abi: [
      { name: "balanceOf", type: "function", stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }] },
    ] as any,
    functionName: "balanceOf" as const,
    args: address ? [address] : undefined,
  }));

  const { data, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address, refetchInterval: 3_000, refetchOnWindowFocus: true },
  });

  return {
    balances: Object.fromEntries(
      tokenList.map((t, i) => [
        t.symbol,
        Number(formatUnits((data?.[i]?.result as bigint) ?? 0n, t.decimals)),
      ])
    ) as Record<TokenSymbol, number>,
    refetch,
  };
}
