import { DocPage, InfoBox, Table, Code } from "../_components/DocPage";

export default function ContractsPage() {
  return (
    <DocPage
      title="Smart Contracts"
      description="Technical reference for ArcBank smart contracts deployed on Arc Testnet."
      prev={{ label: "DeFi Agents", href: "/docs/agents" }}
      next={{ label: "FAQ", href: "/docs/faq" }}
    >
      <InfoBox title="Network">
        All contracts are deployed on <strong>Arc Testnet</strong> (Chain ID: 5042002).
        Block explorer:{" "}
        <a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>
          testnet.arcscan.app
        </a>
      </InfoBox>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>CONTRACT ADDRESSES</h2>
      <Table
        headers={["Contract", "Address"]}
        rows={[
          ["LendingPool", "0xC0aC41e7ACF5a4c150CbF7236F7E0f8e95aD80ec"],
          ["PriceOraclePyth", "0xb9f2F5326FcdcDB2D9a9DF3aF21A95279621f999"],
          ["InterestRateStrategy", "0x22B2A153F7694e49096ef91D627a80c5b6602Ffd"],
          ["xUSDC (testnet)", "0xFa090bd1A524D861542888B6c5e7965dde1F4f35"],
          ["xEURC (testnet)", "0x11aC6A7f4c3235e4edda971838640bE9e55aC222"],
          ["xclrBTC (testnet)", "0x938ae31cc6418acc6730cF1AFFE53E91c143B078"],
          ["Liquidation Bot (ERC-8004 #30907)", "0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>PRICE ORACLE — PYTH NETWORK</h2>
      <InfoBox>
        ArcBank uses <strong>Pyth Network</strong> for real-time on-chain prices.
        Pyth is a pull oracle — prices are fetched from Hermes API and pushed on-chain every ~15 seconds by the Liquidation Bot.
        The same oracle infrastructure is used by major DeFi protocols on mainnet.
      </InfoBox>

      <Table
        headers={["Token", "Pyth Price ID"]}
        rows={[
          ["xclrBTC / BTC", "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"],
          ["xEURC / EUR", "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b"],
          ["xUSDC / USDC", "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"],
        ]}
      />

      <div style={{ border: "3px solid #000", padding: "16px 20px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div><strong>Pyth on Arc Testnet:</strong> 0x2880aB155794e7179c9eE2e38200202908C17B43</div>
        <div><strong>Hermes API:</strong> https://hermes.pyth.network</div>
        <div><strong>Staleness threshold:</strong> 15 seconds (pushed by bot) / 3600 seconds (max before revert)</div>
      </div>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>ARC ERC-8004 AGENT REGISTRY</h2>
      <InfoBox>
        The ArcBank Liquidation Bot is registered as an on-chain AI agent via Arc's ERC-8004 standard.
        This gives the bot a verifiable on-chain identity and reputation system.
      </InfoBox>
      <Table
        headers={["Contract", "Address"]}
        rows={[
          ["IdentityRegistry", "0x8004A818BFB912233c491871b3d84c89A494BD9e"],
          ["ReputationRegistry", "0x8004B663056A597Dffe9eCcC1965A193B7388713"],
          ["ValidationRegistry", "0x8004Cb1BF31DAf7788923b405b754f57acEB4272"],
        ]}
      />
      <div style={{ border: "3px solid #000", padding: "16px 20px", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2, background: "#f9f9f9" }}>
        <div><strong>Bot wallet:</strong> 0x9E47c5EE0b1174a5F4450553CE45Fdcf6bCd036a</div>
        <div><strong>Agent ID:</strong> #30907</div>
        <div><strong>Registered via:</strong> IdentityRegistry.register(metadataURI)</div>
      </div>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>ARCHITECTURE</h2>
      <div style={{ border: "3px solid #000", padding: "24px", background: "#f9f9f9", marginBottom: 32, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 2 }}>
        <div>LendingPool.sol</div>
        <div style={{ paddingLeft: 24 }}>├── PriceOraclePyth.sol → Pyth Network (real-time, 15s updates)</div>
        <div style={{ paddingLeft: 24 }}>├── InterestRateStrategy.sol (2-slope variable rate)</div>
        <div style={{ paddingLeft: 24 }}>│     base 5% → kink 80% → slope2 145% → cap 1000%</div>
        <div style={{ paddingLeft: 24 }}>├── libraries/ReserveLogic.sol (scaled balance indexes, overflow guard)</div>
        <div style={{ paddingLeft: 24 }}>├── libraries/ValidationLogic.sol (health factor math)</div>
        <div style={{ paddingLeft: 24 }}>└── mocks/MockERC20.sol × 3 (24h on-chain faucet cooldown)</div>
        <div style={{ marginTop: 8 }}>Liquidation Bot (agents/)</div>
        <div style={{ paddingLeft: 24 }}>├── pool-reader.ts → getAllBorrowers (incremental scan) + Multicall3 HF reads</div>
        <div style={{ paddingLeft: 24 }}>├── oracle-updater.ts → Pyth Hermes API → updatePrices() every 15s</div>
        <div style={{ paddingLeft: 24 }}>├── liquidator.ts → estimatePlan + execute + profit check</div>
        <div style={{ paddingLeft: 24 }}>├── auto-refill.ts → deployer → bot wallet when gas &lt; 10 USDC</div>
        <div style={{ paddingLeft: 24 }}>└── arc-registry.ts → ERC-8004 identity registration</div>
      </div>

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16 }}>KEY FUNCTIONS</h2>
      <Table
        headers={["Function", "Description", "Transactions"]}
        rows={[
          ["deposit(token, amount)", "Supply assets to the pool", "approve + deposit"],
          ["withdraw(token, amount)", "Withdraw supplied assets + interest", "1 tx"],
          ["borrow(token, amount)", "Borrow against collateral", "1 tx"],
          ["repay(token, amount)", "Repay debt", "approve + repay"],
          ["liquidate(borrower, debtToken, collToken, amount)", "Liquidate undercollateralized position", "approve + liquidate"],
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
          ["MAX_STALENESS", "3600s", "Pyth price freshness check (hard limit)"],
          ["ORACLE_BOT_INTERVAL", "15s", "Bot pushes fresh prices this often"],
        ]}
      />

      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 24, marginBottom: 16, marginTop: 40 }}>SECURITY FIXES APPLIED</h2>
      <Table
        headers={["ID", "Severity", "Fix"]}
        rows={[
          ["H-1", "Critical", "_updateAllIndexes() before HF check in liquidate()"],
          ["H-2", "High", "Same fix in withdraw() and borrow()"],
          ["C-1", "Critical", "Supply cap validated after index update"],
          ["C-2", "High", "Liquidation collateral accounting corrected"],
          ["C-3", "Medium", "MockAggregator.setAnswer() protected with onlyOwner"],
          ["ReserveLogic", "High", "uint128 overflow guard on borrowIndex/liquidityIndex"],
          ["PriceOracle", "Medium", ".call() instead of .transfer() for fee withdrawal"],
          ["Bot", "High", "Collateral token can never equal debt token"],
        ]}
      />

      <div style={{ border: "3px solid #000", padding: "20px 24px" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, margin: 0 }}>
          Source code:{" "}
          <a href="https://github.com/PigAssasin/arcbank" target="_blank" rel="noopener noreferrer" style={{ color: "#000", fontWeight: 600 }}>
            github.com/PigAssasin/arcbank
          </a>
        </p>
      </div>
    </DocPage>
  );
}
