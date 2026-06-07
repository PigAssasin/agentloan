# Protocol Manager — Build Plan
> Created: 2026-06-07 | Based on audit findings
> Strategy: Replace coordinator-agent with Protocol Manager (same process count, no OOM)

---

## Architecture decision

```
BEFORE:
  arcbank-bot       = liquidation + oracle push (conflict risk)
  coordinator-agent = coordinator AI

AFTER:
  arcbank-bot        = liquidation ONLY (oracle push removed)
  protocol-manager   = oracle keeper + coordinator + health monitor
  (same 4 total processes — no RAM issue)
```

---

## Issues fixed by this design

| Issue | How fixed |
|---|---|
| Nonce conflict | Only protocol-manager pushes oracle, bot never does |
| RAM (5th process OOM) | Replace coordinator-agent, same count |
| coordinator.json race | Only protocol-manager writes it |
| Coordinator duplication | Existing coordinator-agent.ts migrated in, not duplicated |

---

## PHASE 0 — Supabase: add protocol_metrics table (10 min)

Run in Supabase SQL Editor:

```sql
CREATE TABLE protocol_metrics (
  id              BIGSERIAL PRIMARY KEY,
  recorded_at     TIMESTAMPTZ DEFAULT now(),

  -- Pool state (per token)
  usdc_utilization   NUMERIC,   -- totalScaledBorrow * borrowIndex / RAY / (totalScaledSupply * liquidityIndex / RAY)
  eurc_utilization   NUMERIC,
  btc_utilization    NUMERIC,

  -- Oracle freshness (from Pyth contract, NOT lastUpdateTimestamp)
  btc_pyth_age_sec   INTEGER,   -- seconds since last Pyth publishTime
  eur_pyth_age_sec   INTEGER,
  usdc_pyth_age_sec  INTEGER,

  -- Bot health
  bot_last_block     BIGINT,    -- from agents/state/last-block.txt
  bot_alive          BOOLEAN,   -- currentBlock - bot_last_block < 200

  -- Risk
  total_bad_debt_usd NUMERIC,   -- sum of positions where HF < 1.0
  liquidatable_count INTEGER,

  -- Notes from LLM
  health_summary     TEXT,      -- LLM daily/anomaly assessment
  risk_level         TEXT       -- LOW / MEDIUM / HIGH
);

CREATE INDEX ON protocol_metrics(recorded_at DESC);

-- Keep 30 days of hourly data
SELECT cron.schedule('cleanup-metrics','0 4 * * *',$$
  DELETE FROM protocol_metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
$$);
```

**CHECKPOINT 0:** Table created, cron scheduled.

---

## PHASE 1 — Remove oracle push from liquidation-bot.ts (30 min)

**File:** `agents/liquidation-bot.ts`

Find and remove the oracle push block. The bot's `isOracleStale()` check can stay as a guard, but it should LOG a warning instead of pushing:

```typescript
// BEFORE (remove this):
if (isOracleStale()) {
  await safeUpdateOracle(wallet);
}

// AFTER (replace with):
if (isOracleStale()) {
  console.warn("  [bot] Oracle stale — Protocol Manager should handle this");
  // Do NOT push from bot — Protocol Manager is the oracle keeper
}
```

**Why:** Prevents nonce conflict. Protocol Manager becomes the sole oracle pusher.

**CHECKPOINT 1:** Build passes, existing tests pass, bot still liquidates.

---

## PHASE 2 — Write `agents/protocol-manager.ts` (2h)

Three loops in one process:

### Loop A — Oracle Keeper (every 15s)

```typescript
// Uses same oracle-updater.ts as before
// But NOW it's the only caller — no nonce conflict

async function runOracleKeeper() {
  try {
    if (await isOracleStale(publicClient, BOT_CONFIG.ORACLE_STALENESS_THRESHOLD)) {
      await updateOraclePrices(deployerWallet);
      console.log(`  [oracle] pushed at block ${await publicClient.getBlockNumber()}`);
    }
    // Write heartbeat
    fs.writeFileSync(
      "agents/state/pm-heartbeat.json",
      JSON.stringify({ ts: Date.now(), block: currentBlock }),
    );
  } catch (e: any) {
    console.error("  [oracle] PUSH FAILED:", e.message?.slice(0, 80));
    await notify(`⚠️ Oracle push failed: ${e.message?.slice(0, 100)}`);
  }
}
setInterval(runOracleKeeper, 15_000);
```

### Loop B — Coordinator AI (every 30s)

Migrate from `coordinator-agent.ts` directly:
- Same scoring function
- Same LLM trigger logic (price >1.5%, new HF < 1.05)
- Same coordinator.json write
- Same memory system

```typescript
// Identical to coordinator-agent.ts main loop
// Just moved into protocol-manager.ts
setInterval(runCoordinator, 30_000);
```

### Loop C — Health Monitor (every 60s)

```typescript
async function runHealthMonitor() {
  const metrics = await collectMetrics();
  await storeMetrics(metrics);

  // Rule-based alerts (immediate, no LLM)
  if (metrics.btc_pyth_age_sec > 120)
    await notify(`⚠️ BTC oracle stale ${metrics.btc_pyth_age_sec}s`);
  if (metrics.usdc_utilization > 0.90)
    await notify(`⚠️ xUSDC utilization ${(metrics.usdc_utilization*100).toFixed(1)}%`);
  if (!metrics.bot_alive)
    await notify(`🚨 Liquidation bot appears offline`);

  // LLM anomaly detection (every 5 min, only if anomaly)
  const hasAnomaly = detectAnomaly(metrics, recentMetrics);
  if (hasAnomaly && shouldCallLLM()) {
    const analysis = await analyzeWithLLM(metrics, recentMetrics);
    if (analysis.risk_level !== "LOW") {
      await notify(`📊 Health Alert\n${analysis.summary}`);
    }
    await updateMetricSummary(analysis);
    updateLastLLMCall();
  }
}
setInterval(runHealthMonitor, 60_000);
```

### collectMetrics() — correct implementation

```typescript
async function collectMetrics(): Promise<Metrics> {
  // Utilization: must multiply scaled values by index
  const [usdcReserve, eurcReserve, btcReserve] = await Promise.all([
    pool.getReserveData(X_USDC),
    pool.getReserveData(X_EURC),
    pool.getReserveData(X_CLR_BTC),
  ]);

  const utilization = (r: ReserveData) => {
    const supply = (r.totalScaledSupply * r.liquidityIndex) / RAY;
    const borrow = (r.totalScaledBorrow * r.borrowIndex) / RAY;
    return supply > 0n ? Number(borrow) / Number(supply) : 0;
  };

  // Oracle age: read from PYTH CONTRACT, not lastUpdateTimestamp
  const PYTH_ABI = parseAbi(["function getPriceUnsafe(bytes32) view returns (int64,uint64,int32,uint)"]);
  const [btcAge, eurAge, usdcAge] = await Promise.all(
    PRICE_IDS.map(async (id) => {
      const [, , , publishTime] = await publicClient.readContract({
        address: PYTH_ADDRESS, abi: PYTH_ABI,
        functionName: "getPriceUnsafe", args: [id],
      }) as [bigint, bigint, bigint, bigint];
      return Number(BigInt(Math.floor(Date.now() / 1000)) - publishTime);
    })
  );

  // Bot liveness: compare last-block.txt to current block
  const lastBlock = readLastBlock(); // from pool-reader.ts
  const currentBlock = await publicClient.getBlockNumber();
  const botAlive = (currentBlock - lastBlock) < 200n; // ~96s at 0.48s/block

  return {
    usdc_utilization: utilization(usdcReserve),
    eurc_utilization: utilization(eurcReserve),
    btc_utilization:  utilization(btcReserve),
    btc_pyth_age_sec: btcAge,
    eur_pyth_age_sec: eurAge,
    usdc_pyth_age_sec: usdcAge,
    bot_last_block:   Number(lastBlock),
    bot_alive:        botAlive,
    total_bad_debt_usd: 0, // computed separately from known-borrowers
    liquidatable_count: 0,
  };
}
```

### LLM anomaly detection

```
Trigger LLM when any of:
  - utilization changed > 15% in 5 minutes
  - oracle age > 2× normal
  - bot offline > 3 min
  - bad debt increased

LLM prompt includes:
  - Current metrics snapshot
  - Last 10 metric records (trend)
  - Any active alerts

LLM returns: { risk_level: "LOW"|"MEDIUM"|"HIGH", summary: "..." }
```

### Daily digest (cron via PM2)

```javascript
// ecosystem.config.js — separate PM2 entry for digest
{
  name: "pm-daily-digest",
  script: "/root/arcbank/run-pm-digest.sh",
  interpreter: "bash",
  cron_restart: "0 8 * * *",  // 8am UTC daily
  autorestart: false,
}
```

```bash
# run-pm-digest.sh
exec /usr/bin/ts-node --transpile-only -P /root/arcbank/tsconfig.hardhat.json \
  /root/arcbank/agents/protocol-manager-digest.ts
```

Separate file `agents/protocol-manager-digest.ts` — runs once, sends daily summary, exits.

---

## PHASE 3 — Update ecosystem.config.js (10 min)

```javascript
// Remove coordinator-agent entry
// Add protocol-manager entry

{
  name: "protocol-manager",
  script: "/root/arcbank/run-protocol-manager.sh",
  interpreter: "bash",
  cwd: "/root/arcbank",
  restart_delay: 10000,
  max_restarts: 10,
  min_uptime: "15s",
  out_file: "logs/pm-out.log",
  error_file: "logs/pm-err.log",
  log_date_format: "YYYY-MM-DD HH:mm:ss",
  merge_logs: true,
},
```

---

## PHASE 4 — VPS deployment (careful)

```bash
# Check RAM before starting
free -m  # must be > 300MB free after stopping coordinator

# Step 1: Stop coordinator-agent
pm2 stop coordinator-agent

# Step 2: Pull + start protocol-manager  
git pull origin main
pm2 start ecosystem.config.js --only protocol-manager

# Wait 30s
pm2 logs protocol-manager --lines 20

# Step 3: Restart bot with oracle push removed
pm2 restart arcbank-bot

# Verify
pm2 status  # should show: arcbank-bot, protocol-manager, signal-agent, personal-agent
free -m     # should have > 80MB free
```

**CHECKPOINT 4:**
```
□ protocol-manager: oracle pushing (logs show "[oracle] pushed")
□ coordinator.json being written
□ arcbank-bot: liquidating, NOT pushing oracle
□ health monitor: metrics stored in Supabase
□ RAM stable
```

---

## Things explicitly NOT in scope

| Item | Reason |
|---|---|
| "External watchdog" (UptimeRobot) | Use PM2's built-in restart + Telegram alert instead |
| Auto-restart other processes | PM2 handles this, agent just alerts |
| Pause borrowing when utilization high | Requires admin function + policy decision |
| Bad debt detection from full scan | Requires scanning all borrowers, expensive — use known-borrowers.json only |

---

## Issues resolved from audit

| Audit issue | Resolution |
|---|---|
| 1 - Nonce conflict | Oracle only in Protocol Manager |
| 2 - Coordinator duplication | Merged into PM, coordinator-agent removed |
| 3a - Scaled vs real utilization | collectMetrics() multiplies by index |
| 3b - Bad debt misses new borrowers | Use known-borrowers.json, accept limitation |
| 3c - Bot liveness via PM2 | Use last-block.txt vs currentBlock instead |
| 3d - Oracle lag from wrong source | Read from Pyth getPriceUnsafe() directly |
| 4 - LLM rate limit | Acceptable, same 5-min cooldown applies |
| 5 - Missing metrics table | Added in Phase 0 |
| 6 - RAM/OOM | Replace coordinator-agent, same 4 processes |
| 8 - /v1/health missing | PM heartbeat file + notifier for critical alerts |
| 9 - coordinator.json race | Single writer (Protocol Manager) |
| 10 - Daily digest cron | PM2 cron_restart on separate entry |

---

## Build order

```
Phase 0  Supabase metrics table          10 min
Phase 1  Remove oracle from bot          30 min
Phase 2  Write protocol-manager.ts        2h
Phase 3  Update ecosystem.config.js      10 min
Phase 4  VPS deployment                  30 min
Total: ~3.5h
```
