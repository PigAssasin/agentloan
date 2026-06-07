# Protocol Manager — Build Plan (v2, reviewed)
> Created: 2026-06-07 | Reviewed twice — all critical issues fixed
> Strategy: Replace coordinator-agent with Protocol Manager (same 4 processes, no OOM)

---

## Architecture

```
BEFORE:
  arcbank-bot       = liquidation + oracle push (conflict risk)
  coordinator-agent = coordinator AI only

AFTER:
  arcbank-bot       = liquidation ONLY (oracle removed)
  protocol-manager  = oracle keeper + coordinator + health monitor
  (same 4 total — no RAM issue, no nonce conflict)
```

---

## Issues fixed from 2 review rounds (10 critical items)

| # | Issue | Fix |
|---|---|---|
| 1 | `readLastBlock` not exported | Export it from pool-reader.ts |
| 2 | `isOracleStale()` takes 0 args, plan passed 2 | Use correct 0-arg signature |
| 3 | Phase 1 code snippet pseudocode, missed DRY_RUN guard | Show exact lines 224-233 |
| 4 | `RAY` not defined in agents | Define `const RAY = 10n ** 27n` |
| 5 | `PYTH_ADDRESS` not in config | Add to config/contracts.ts (0x2880aB...) |
| 6 | `getPriceUnsafe` ABI unverified for Arc | Use IPyth.sol interface already in project |
| 7 | Duplicate `import * as path` in coordinator-agent | Dedup on merge |
| 8 | Oracle gap window before bot restart | Verify `[oracle] pushed` in logs before Step 3 |
| 9 | PM2 `cron_restart` + `autorestart: false` unreliable | Use OS crontab instead |
| 10 | signal-agent not in ecosystem.config.js | Note: managed separately, not in ecosystem |

---

## PHASE 0A — Add PYTH_ADDRESS to config (5 min)

**File:** `config/contracts.ts` — add to ARC_TESTNET_CONTRACTS:

```typescript
// Pyth Network on Arc Testnet
PYTH: "0x2880aB155794e7179c9eE2e38200202908C17B43" as `0x${string}`,
```

Source: `contracts/PriceOraclePyth.sol` line 15 (verified from deployed contract).

---

## PHASE 0B — Export readLastBlock from pool-reader.ts (2 min)

**File:** `agents/lib/pool-reader.ts` line 48 — add `export`:

```typescript
// Before:
function readLastBlock(): bigint {

// After:
export function readLastBlock(): bigint {
```

---

## PHASE 0C — Supabase: add protocol_metrics table (10 min)

Run in Supabase SQL Editor:

```sql
CREATE TABLE protocol_metrics (
  id                 BIGSERIAL PRIMARY KEY,
  recorded_at        TIMESTAMPTZ DEFAULT now(),
  usdc_utilization   NUMERIC,
  eurc_utilization   NUMERIC,
  btc_utilization    NUMERIC,
  btc_pyth_age_sec   INTEGER,
  eur_pyth_age_sec   INTEGER,
  usdc_pyth_age_sec  INTEGER,
  bot_last_block     BIGINT,
  bot_alive          BOOLEAN,
  total_bad_debt_usd NUMERIC,
  liquidatable_count INTEGER,
  health_summary     TEXT,
  risk_level         TEXT
);

CREATE INDEX ON protocol_metrics(recorded_at DESC);

SELECT cron.schedule('cleanup-metrics','0 4 * * *',$$
  DELETE FROM protocol_metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
$$);
```

**CHECKPOINT 0:** Config updated, readLastBlock exported, metrics table created.

---

## PHASE 1 — Remove oracle push from liquidation-bot.ts (30 min)

**File:** `agents/liquidation-bot.ts` lines 224–233

**Exact replacement** (keep the comment, replace only the push logic):

```typescript
// ── Step 2: Update oracle if stale ─────────────────────────────────
// Oracle update is now handled by Protocol Manager exclusively.
// Bot logs a warning if oracle is stale but does NOT push.
const stale = await isOracleStale();
if (stale) {
  console.warn(`  [block ${block.number}] oracle stale — Protocol Manager should push`);
  // DO NOT call safeUpdateOracle here — Protocol Manager is the sole oracle keeper
}
```

Also remove `safeUpdateOracle` from imports if it becomes unused.

Run existing tests after this change:
```bash
TS_NODE_PROJECT=tsconfig.hardhat.json npx hardhat test
```

**CHECKPOINT 1:** All 80 tests pass. Bot no longer pushes oracle.

---

## PHASE 2 — Write `agents/protocol-manager.ts` (2h)

### Imports and constants

```typescript
import * as dotenv from "dotenv";
import * as path   from "path";
import * as fs     from "fs";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { callLLM }            from "./lib/gemini-client";
import { updateOraclePrices } from "./lib/oracle-updater";
import { isOracleStale, getPositionsBatch, filterLiquidatable, readLastBlock } from "./lib/pool-reader";
import { notify }             from "./lib/notifier";
import { ARC_TESTNET_CONTRACTS, AGENT_IDS } from "../config/contracts";

// Coordinator imports (migrated from coordinator-agent.ts)
import { loadMemory, saveMemory, updateOutcome } from "./lib/coordinator-memory";

const RAY = 10n ** 27n;  // Aave-style ray math constant

const PYTH_ADDRESS  = ARC_TESTNET_CONTRACTS.PYTH;
const PRICE_IDS = {
  BTC:  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  EUR:  "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
  USDC: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
};
```

### Oracle Keeper (Loop A, every 15s)

```typescript
const deployerAccount = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
const deployerWallet  = createWalletClient({ account: deployerAccount, chain: arcChain, transport: http() });

async function runOracleKeeper() {
  try {
    const stale = await isOracleStale(); // 0-arg, uses BOT_CONFIG internally
    if (stale) {
      await updateOraclePrices(deployerWallet);
      console.log(`  [oracle] pushed at ${new Date().toISOString()}`);
    }
    fs.writeFileSync(
      path.resolve(__dirname, "../agents/state/pm-heartbeat.json"),
      JSON.stringify({ ts: Date.now(), alive: true }),
    );
  } catch (e: any) {
    console.error("  [oracle] FAILED:", e.message?.slice(0, 80));
    await notify(`⚠️ Protocol Manager oracle push failed: ${e.message?.slice(0, 80)}`);
  }
}
setInterval(runOracleKeeper, 15_000);
```

### Coordinator AI (Loop B, every 30s)

Migrate `coordinator-agent.ts` logic directly. Key deduplication:
- Remove duplicate `import * as path from "path"` (appears twice in coordinator-agent.ts)
- Keep all other logic identical
- Still reads/writes `agents/state/coordinator.json`

### Health Monitor (Loop C, every 60s)

```typescript
// Pyth ABI — use IPyth interface already imported via PriceOraclePyth.sol dependency
// getPriceUnsafe returns PythStructs.Price: (int64 price, uint64 conf, int32 expo, uint publishTime)
const PYTH_ABI = parseAbi([
  "function getPriceUnsafe(bytes32 id) external view returns (int64 price, uint64 conf, int32 expo, uint publishTime)",
]);

async function getOracleAgeSeconds(priceId: string): Promise<number> {
  try {
    const result = await publicClient.readContract({
      address:      PYTH_ADDRESS,
      abi:          PYTH_ABI,
      functionName: "getPriceUnsafe",
      args:         [priceId as `0x${string}`],
    }) as { price: bigint; conf: bigint; expo: bigint; publishTime: bigint };

    const age = Math.floor(Date.now() / 1000) - Number(result.publishTime);
    return Math.max(0, age);
  } catch {
    return 9999; // treat as very stale if call fails
  }
}

async function collectMetrics() {
  const POOL_ABI = parseAbi([
    "function getReserveData(address) external view returns (uint128,uint128,uint128,uint128,uint256,uint256,uint256,uint256,uint8,bool,uint16,uint16,uint16)",
  ]);

  const [usdcR, eurcR, btcR] = await Promise.all([
    publicClient.readContract({ address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI, functionName: "getReserveData", args: [ARC_TESTNET_CONTRACTS.X_USDC] }),
    publicClient.readContract({ address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI, functionName: "getReserveData", args: [ARC_TESTNET_CONTRACTS.X_EURC] }),
    publicClient.readContract({ address: ARC_TESTNET_CONTRACTS.LENDING_POOL, abi: POOL_ABI, functionName: "getReserveData", args: [ARC_TESTNET_CONTRACTS.X_CLR_BTC] }),
  ]) as unknown as [bigint[], bigint[], bigint[]];

  // ReserveData field positions: [0]=liquidityIndex, [1]=borrowIndex, [4]=totalScaledSupply, [5]=totalScaledBorrow
  const utilization = (r: bigint[]) => {
    const supply = (r[4] * r[0]) / RAY;
    const borrow = (r[5] * r[1]) / RAY;
    return supply > 0n ? Number(borrow) / Number(supply) : 0;
  };

  const [btcAge, eurAge, usdcAge] = await Promise.all([
    getOracleAgeSeconds(PRICE_IDS.BTC),
    getOracleAgeSeconds(PRICE_IDS.EUR),
    getOracleAgeSeconds(PRICE_IDS.USDC),
  ]);

  // Bot liveness: compare last-block.txt to current block (~0.48s/block, 200 blocks ≈ 96s)
  const lastBlock     = readLastBlock();
  const currentBlock  = await publicClient.getBlockNumber();
  const botAlive      = (currentBlock - lastBlock) < 200n;

  return {
    usdc_utilization: utilization(usdcR),
    eurc_utilization: utilization(eurcR),
    btc_utilization:  utilization(btcR),
    btc_pyth_age_sec: btcAge,
    eur_pyth_age_sec: eurAge,
    usdc_pyth_age_sec: usdcAge,
    bot_last_block:   Number(lastBlock),
    bot_alive:        botAlive,
    total_bad_debt_usd: 0,
    liquidatable_count: 0,
  };
}

async function runHealthMonitor() {
  const metrics = await collectMetrics();

  // Store to Supabase
  const SB_URL  = process.env.SUPABASE_URL!;
  const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const SB_HDRS = { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" };
  await fetch(`${SB_URL}/rest/v1/protocol_metrics`, {
    method: "POST", headers: SB_HDRS,
    body: JSON.stringify({ ...metrics, recorded_at: new Date().toISOString() }),
  }).catch(() => {});

  // Rule-based alerts
  if (metrics.btc_pyth_age_sec > 120)
    await notify(`⚠️ BTC oracle stale ${metrics.btc_pyth_age_sec}s`);
  if (metrics.usdc_utilization > 0.90)
    await notify(`⚠️ xUSDC utilization ${(metrics.usdc_utilization*100).toFixed(1)}%`);
  if (!metrics.bot_alive)
    await notify(`🚨 Liquidation bot appears offline (>${metrics.bot_last_block} blocks ago)`);

  // LLM anomaly — every 5 min if anomaly
  // (uses same shouldCallLLM / updateLastLLMCall pattern as coordinator)
}
setInterval(runHealthMonitor, 60_000);
```

### Daily digest

Use **OS crontab** (NOT PM2 cron_restart — unreliable with autorestart:false):

```bash
# On VPS: crontab -e
0 8 * * * /usr/bin/ts-node --transpile-only -P /root/arcbank/tsconfig.hardhat.json /root/arcbank/agents/pm-daily-digest.ts >> /root/arcbank/logs/pm-digest.log 2>&1
```

Separate file `agents/pm-daily-digest.ts` — runs once, sends LLM daily summary, exits 0.

---

## PHASE 3 — Update ecosystem.config.js (10 min)

```javascript
// Replace coordinator-agent entry with protocol-manager:
{
  name: "protocol-manager",
  script: "/root/arcbank/run-protocol-manager.sh",
  interpreter: "bash",
  cwd: "/root/arcbank",
  restart_delay: 10000,
  max_restarts: 10,
  min_uptime: "15s",
  out_file:   "logs/pm-out.log",
  error_file: "logs/pm-err.log",
  log_date_format: "YYYY-MM-DD HH:mm:ss",
  merge_logs: true,
},
```

Note: `signal-agent` is managed via its own setup (`/root/signal-agent/`), not this ecosystem file.

---

## PHASE 4 — VPS deployment (careful sequence)

```bash
# 1. Check RAM
free -m  # must be > 300MB free after stopping coordinator

# 2. Stop coordinator-agent
pm2 stop coordinator-agent

# 3. Pull new code
cd /root/arcbank && git pull origin main

# 4. Start protocol-manager
pm2 start ecosystem.config.js --only protocol-manager
# Wait and verify oracle is being pushed BEFORE restarting bot:
sleep 20
pm2 logs protocol-manager --lines 10 --nostream | grep "\[oracle\] pushed"
# Must see at least 1 "[oracle] pushed" line before continuing

# 5. Only after oracle push confirmed — restart bot
pm2 restart arcbank-bot
sleep 5
pm2 logs arcbank-bot --lines 5 --nostream | grep -v "oracle stale — Protocol"
# Should NOT see oracle push attempts from bot

# 6. Setup daily digest cron
crontab -e  # add: 0 8 * * * /usr/bin/ts-node ...

# 7. Verify final state
pm2 status  # arcbank-bot, protocol-manager, signal-agent, personal-agent
free -m     # > 80MB free
```

**CHECKPOINT 4:**
```
□ pm2 logs protocol-manager: "[oracle] pushed" appears every 15s
□ pm2 logs arcbank-bot: NO oracle push lines
□ Supabase protocol_metrics: rows appearing every 60s
□ coordinator.json being updated (check mtime)
□ RAM stable > 80MB free
□ crontab entry for daily digest
```

---

## Build order

```
Phase 0A  Add PYTH_ADDRESS to config              5 min
Phase 0B  Export readLastBlock                    2 min
Phase 0C  Supabase metrics table                 10 min
Phase 1   Remove oracle from liquidation-bot     30 min + tests
Phase 2   Write protocol-manager.ts               2h
Phase 3   Update ecosystem.config.js             10 min
Phase 4   VPS deployment                         30 min

Total: ~3.5h
```
