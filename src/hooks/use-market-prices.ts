"use client";

import { useEffect, useState } from "react";

export interface MarketPrices {
  BTC:  number | null;
  EUR:  number | null;
  USDC: number;
  updatedAt: Date | null;
}

const FALLBACK: MarketPrices = { BTC: null, EUR: null, USDC: 1, updatedAt: null };

export function useMarketPrices(intervalMs = 30_000): MarketPrices {
  const [prices, setPrices] = useState<MarketPrices>(FALLBACK);

  async function fetch_() {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json() as { bitcoin: { usd: number } };

      // EUR/USD via exchangerate-api (free, no key)
      let eurUsd = 1.08;
      try {
        const er = await fetch("https://api.exchangerate-api.com/v4/latest/EUR");
        if (er.ok) {
          const ed = await er.json() as { rates: { USD: number } };
          eurUsd = ed.rates.USD;
        }
      } catch { /* use fallback */ }

      setPrices({
        BTC:  data.bitcoin.usd,
        EUR:  eurUsd,
        USDC: 1,
        updatedAt: new Date(),
      });
    } catch { /* keep previous */ }
  }

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return prices;
}
