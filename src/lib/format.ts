export function formatUSD(value: bigint, decimals: number = 6): string {
  const num = Number(value) / 10 ** decimals;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function formatToken(value: bigint, decimals: number, symbol: string): string {
  const num = Number(value) / 10 ** decimals;
  if (decimals === 8) return `${num.toFixed(6)} ${symbol}`;
  return `${num.toFixed(2)} ${symbol}`;
}

export function formatAPY(rateRay: bigint): string {
  const pct = Number(rateRay) / 1e25;
  return `${pct.toFixed(2)}%`;
}

export function formatHealthFactor(hf: bigint): string {
  const MAX = 2n ** 256n - 1n;
  if (hf === MAX || hf === 0n) return "∞";
  const val = Number(hf) / 1e18;
  if (val > 100) return "∞";
  return val.toFixed(2);
}

export function healthFactorColor(hf: bigint): string {
  const WAD = 10n ** 18n;
  const MAX = 2n ** 256n - 1n;
  if (hf === MAX || hf === 0n) return "rgb(160, 224, 171)";
  if (hf >= (15n * WAD) / 10n) return "rgb(160, 224, 171)";
  if (hf >= WAD) return "rgb(255, 172, 46)";
  return "rgb(165, 45, 37)";
}

export function healthFactorLabel(hf: bigint): string {
  const WAD = 10n ** 18n;
  const MAX = 2n ** 256n - 1n;
  if (hf === MAX || hf === 0n) return "Safe";
  if (hf >= (15n * WAD) / 10n) return "Safe";
  if (hf >= WAD) return "At Risk";
  return "Liquidatable";
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
