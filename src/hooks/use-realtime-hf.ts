"use client";

/**
 * Calculates an estimated Health Factor using real-time market prices (CoinGecko)
 * vs the on-chain oracle price. Shows a warning when prices diverge significantly.
 *
 * The on-chain HF (from getUserAccountData) uses the oracle price (updated every 5 min).
 * This hook provides a "real-time estimate" so users know their actual risk exposure.
 */

import { useMarketPrices } from "./use-market-prices";
import { useUserTokenBalances, useReserveData, TOKENS } from "./use-lending-pool";

const WAD = 1e18;

// Liquidation thresholds (basis points) — must match contract
const LIQ_THRESHOLD: Record<string, number> = {
  xUSDC:   8500,
  xEURC:   8500,
  xclrBTC: 7500,
};

export interface RealtimeHF {
  // Estimated HF using live market prices
  estimated: string;
  estimatedRaw: number;

  // Price deviation: how much on-chain price differs from real-time
  // If > threshold, user should be warned
  priceDeviation: {
    xclrBTC: number | null; // percentage deviation
    xEURC:   number | null;
  };

  // True if prices are stale enough to matter (>1% deviation)
  hasSignificantDeviation: boolean;

  // On-chain prices (from useReserveData which reads oracle)
  onChainPrices: { xclrBTC: number | null; xEURC: number | null; xUSDC: number };
}

export function useRealtimeHF(onChainHF: string): RealtimeHF {
  const livePrice  = useMarketPrices(15_000); // 15s refresh for HF calc
  const { supply, borrow } = useUserTokenBalances();
  const { reserves } = useReserveData();

  const onChainPrices = {
    xclrBTC: reserves["xclrBTC"]?.priceUSD ?? null,
    xEURC:   reserves["xEURC"]?.priceUSD   ?? null,
    xUSDC:   reserves["xUSDC"]?.priceUSD   ?? 1,
  };

  // Calculate estimated HF with live prices
  let totalCollUSD = 0;
  let totalDebtUSD = 0;

  const tokenList = Object.values(TOKENS);
  for (const t of tokenList) {
    const liveTokenPrice =
      t.symbol === "xclrBTC" ? livePrice.BTC :
      t.symbol === "xEURC"   ? livePrice.EUR :
      livePrice.USDC;

    if (liveTokenPrice === null) continue;

    const supplyAmt = supply[t.symbol] ?? 0;
    if (supplyAmt > 0) {
      const valueUSD = supplyAmt * liveTokenPrice;
      totalCollUSD += (valueUSD * (LIQ_THRESHOLD[t.symbol] ?? 8500)) / 10_000;
    }

    const borrowAmt = borrow[t.symbol] ?? 0;
    if (borrowAmt > 0) {
      totalDebtUSD += borrowAmt * liveTokenPrice;
    }
  }

  const estimatedRaw = totalDebtUSD > 0 ? totalCollUSD / totalDebtUSD : Infinity;
  const estimated    = totalDebtUSD === 0 ? "∞" : estimatedRaw.toFixed(2);

  // Price deviation
  const btcDeviation = (livePrice.BTC && onChainPrices.xclrBTC)
    ? Math.abs((livePrice.BTC - onChainPrices.xclrBTC) / onChainPrices.xclrBTC) * 100
    : null;

  const eurDeviation = (livePrice.EUR && onChainPrices.xEURC)
    ? Math.abs((livePrice.EUR - onChainPrices.xEURC) / onChainPrices.xEURC) * 100
    : null;

  const hasSignificantDeviation =
    (btcDeviation !== null && btcDeviation > 1) ||
    (eurDeviation !== null && eurDeviation > 1);

  return {
    estimated,
    estimatedRaw,
    priceDeviation: { xclrBTC: btcDeviation, xEURC: eurDeviation },
    hasSignificantDeviation,
    onChainPrices,
  };
}
