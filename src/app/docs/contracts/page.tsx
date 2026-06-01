import { DocPage, InfoBox, Table } from "../_components/DocPage";

export default function ContractsPage() {
  return (
    <DocPage
      title="Smart Contracts"
      description="Technical reference for ArcBank smart contracts deployed on Arc Testnet."
      prev={{ label: "Liquidations", href: "/docs/liquidations" }}
      next={{ label: "FAQ", href: "/docs/faq" }}
    >
      <InfoBox title="Network">
        All contracts are deployed on <strong>Arc Testnet</strong> (Chain ID: 5042002).
        Block explorer: <a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>testnet.arcscan.app</a>
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>CONTRACT ADDRESSES</h2>

      <Table
        headers={["Contract", "Address"]}
        rows={[
          ["LendingPool", "0x6cdbe1cc2Cb9864D9c9118b87799D55967151433"],
          ["PriceOraclePyth", "0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999"],
          ["InterestRateStrategy", "0x22B2A153F7694e49096ef91D627a80c5b6602Ffd"],
          ["xUSDC (testnet)", "0xFa090bd1A524D861542888B6c5e7965dde1F4f35"],
          ["xEURC (testnet)", "0x11aC6A7f4c3235e4edda971838640bE9e55aC222"],
          ["xclrBTC (testnet)", "0x938ae31cc6418acc6730cF1AFFE53E91c143B078"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>PRICE ORACLE — PYTH NETWORK</h2>
      <InfoBox>
        ArcBank uses <strong>Pyth Network</strong> for real-time on-chain prices — not mock aggregators.
        Pyth is a pull oracle: price data is fetched from Pyth Hermes API and submitted on-chain before each transaction.
        Prices are also refreshed every 5 minutes by an automated GitHub Action.
      </InfoBox>

      <Table
        headers={["Token", "Pyth Price ID", "Current Price"]}
        rows={[
          ["xclrBTC", "0xe62df6...fd0ace (BTC/USD)", "Real-time from Pyth"],
          ["xEURC", "0xa995d0...ec30b (EUR/USD)", "Real-time from Pyth"],
          ["xUSDC", "0xeaa020...9c94a (USDC/USD)", "Real-time from Pyth"],
        ]}
      />

      <div style={{ border: "3px solid #000", padding: "16px 20px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div><strong>Pyth on Arc Testnet:</strong> 0x2880aB155794e7179c9eE2e38200202908C17B43</div>
        <div><strong>Hermes API:</strong> https://hermes.pyth.network</div>
        <div><strong>Staleness threshold:</strong> 3600 seconds</div>
      </div>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>ARCHITECTURE</h2>
      <div style={{ border: "3px solid #000", padding: "24px", background: "#f9f9f9", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2 }}>
        <div>LendingPool.sol</div>
        <div style={{ paddingLeft: 24 }}>├── PriceOraclePyth.sol → Pyth Network (real-time)</div>
        <div style={{ paddingLeft: 24 }}>├── InterestRateStrategy.sol (2-slope variable rate)</div>
        <div style={{ paddingLeft: 24 }}>├── libraries/ValidationLogic.sol (health factor math)</div>
        <div style={{ paddingLeft: 24 }}>├── libraries/ReserveLogic.sol (scaled balance indexes)</div>
        <div style={{ paddingLeft: 24 }}>└── MockERC20.sol × 3 (24h on-chain faucet cooldown)</div>
      </div>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>KEY FUNCTIONS</h2>

      <Table
        headers={["Function", "Description", "Transactions"]}
        rows={[
          ["deposit(token, amount)", "Supply assets to the pool", "approve + deposit"],
          ["withdraw(token, amount)", "Withdraw supplied assets + interest", "1 tx"],
          ["borrow(token, amount)", "Borrow against collateral", "1 tx"],
          ["repay(token, amount)", "Repay debt", "approve + repay"],
          ["liquidate(borrower, debtToken, collToken, amount)", "Liquidate undercollateralized position", "1 tx"],
          ["getUserAccountData(user)", "Get HF, collateral, debt, available borrows", "read"],
          ["getUserSupplyBalance(token, user)", "Real balance including accrued interest", "read"],
          ["getUserBorrowBalance(token, user)", "Real debt including accrued interest", "read"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>MATH CONSTANTS</h2>
      <Table
        headers={["Constant", "Value", "Used for"]}
        rows={[
          ["RAY", "1e27", "Interest rate indexes and scaled balance math"],
          ["WAD", "1e18", "Health factor and USD price calculations"],
          ["SECONDS_PER_YEAR", "31,536,000", "Annual rate → per-second accrual"],
          ["MAX_STALENESS", "3600s", "Pyth price freshness check"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>GITHUB</h2>
      <div style={{ border: "3px solid #000", padding: "20px 24px" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, margin: 0 }}>
          Source code: <a href="https://github.com/PigAssasin/arcbank" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>github.com/PigAssasin/arcbank</a>
        </p>
      </div>
    </DocPage>
  );
}
