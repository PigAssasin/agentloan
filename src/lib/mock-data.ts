// Mock data for UI preview — replaced by real contract calls after deploy

export const MOCK_RESERVES = [
  {
    symbol: "cirBTC",
    name: "Circle BTC",
    totalDeposited: 250_000_000n,        // 2.5 cirBTC (8 dec)
    totalBorrowed: 0n,
    liquidityIndex: 10n ** 27n,
    borrowIndex: 10n ** 27n,
    supplyAPY: "0.82%",
    borrowAPY: "N/A",
    ltv: 7000n,
    liquidationThreshold: 7500n,
    active: true,
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    totalDeposited: 500_000n * 10n ** 6n,
    totalBorrowed: 120_000n * 10n ** 6n,
    liquidityIndex: 10n ** 27n,
    borrowIndex: 10n ** 27n,
    supplyAPY: "1.24%",
    borrowAPY: "2.10%",
    ltv: 8000n,
    liquidationThreshold: 8500n,
    active: true,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    totalDeposited: 2_000_000n * 10n ** 6n,
    totalBorrowed: 800_000n * 10n ** 6n,
    liquidityIndex: 10n ** 27n,
    borrowIndex: 10n ** 27n,
    supplyAPY: "0.31%",
    borrowAPY: "1.36%",
    ltv: 8000n,
    liquidationThreshold: 8500n,
    active: true,
  },
];

export const MOCK_ACCOUNT = {
  totalCollateralUSD: 3_200n * 10n ** 6n,
  totalDebtUSD: 500n * 10n ** 6n,
  availableBorrowsUSD: 2_060n * 10n ** 6n,
  healthFactor: 48n * 10n ** 17n, // 4.8
};

export const MOCK_POSITIONS = {
  supplied: [
    { symbol: "cirBTC", amount: "0.0500", amountUSD: "$3,200.00", apy: "0.82%" },
  ],
  borrowed: [
    { symbol: "USDC", amount: "500.00", amountUSD: "$500.00", apy: "1.36%" },
  ],
};
