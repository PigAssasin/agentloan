# Personal Agent — Complete Build Plan
> Contracts deployed ✓ — This plan covers everything from DB to UI to VPS
> Created: 2026-06-07

---

## What this builds

A 24/7 DeFi autopilot per user:
- Auto-repay when HF drops (emergency + scheduled)
- Auto-deploy idle xUSDC to earn yield
- Full action history per wallet
- Enable/disable toggle
- LLM reasoning (optional, user brings own key)
- Notification when agent acts

---

## Architecture

```
User wallet (MetaMask)
  ↓ approve xUSDC to AgentExecutor
  ↓ authorizeAgent(AgentExecutor, true) in LendingPool
    
PersonalAgentPanel (UI)
  ↓ reads settings from Supabase via API
  ↓ shows HF, last action, history

personal-agent.ts (VPS, PM2)
  ↓ watchBlocks → Multicall3 HF all users (1 RPC)
  ↓ calls AgentExecutor.emergencyProtect() or deployToYield()
  ↓ writes agent_actions to Supabase
  
AgentExecutor.sol (on-chain, deployed ✓)
  ↓ withdrawFor + repayFor atomic (1 tx)
  ↓ depositFor (supply to pool)
```

---

## PHASE A — Supabase (30 min)

### A1: Create project
- supabase.com → New project → "agentloan"
- Save: Project URL, anon key, service role key

### A2: Run SQL

```sql
-- User settings per wallet
CREATE TABLE user_agent_subscriptions (
  id               BIGSERIAL PRIMARY KEY,
  wallet_address   TEXT NOT NULL,
  agent_type       TEXT NOT NULL DEFAULT 'personal',

  -- Core config
  hf_target        NUMERIC DEFAULT 1.3,
  enabled          BOOLEAN DEFAULT false,

  -- LLM (optional — user brings own key)
  llm_provider     TEXT,          -- 'gemini' | 'openai' | 'deepseek' | 'custom' | null
  llm_api_key_enc  TEXT,          -- AES-256 encrypted, null = no LLM (rule-based only)
  llm_base_url     TEXT,          -- for custom provider

  -- Metadata
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wallet_address, agent_type)
);

-- Every action the agent takes
CREATE TABLE agent_actions (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  action         TEXT,        -- 'repay' | 'deploy_yield' | 'emergency_protect' | 'skip'
  reason         TEXT,        -- why agent took this action
  amount_usd     NUMERIC,
  hf_before      NUMERIC,
  hf_after       NUMERIC,
  success        BOOLEAN,
  tx_hash        TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Agent memory per user (rolling 50)
CREATE TABLE agent_memory (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  type           TEXT,        -- 'observation' | 'decision' | 'outcome'
  content        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Cleanup: keep last 50 memory rows per user per agent_type
CREATE OR REPLACE FUNCTION cleanup_old_memory() RETURNS void AS $$
BEGIN
  DELETE FROM agent_memory WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY wallet_address, agent_type ORDER BY created_at DESC
      ) as rn FROM agent_memory
    ) t WHERE rn <= 50
  );
  DELETE FROM agent_actions
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

### A3: Install + env vars

```bash
npm install @supabase/supabase-js
```

```
# .env.local
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # server only (never expose to browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... # browser safe, read-only by default

# VPS .env.local — same values
```

**CHECKPOINT A:**
```
□ Tables created in Supabase
□ .env.local updated local + VPS
□ npm install @supabase/supabase-js
□ Test: node -e "require('@supabase/supabase-js')" → no error
```

---

## PHASE B — API Routes (1h)

### B1: `src/lib/supabase.ts` — client setup

```typescript
import { createClient } from "@supabase/supabase-js";

// Server-side (API routes, VPS)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Browser-safe
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### B2: `src/app/api/personal-agent/settings/route.ts`

```
GET  ?address=0x...
  → load from user_agent_subscriptions
  → return { enabled, hfTarget, llmProvider, hasLlmKey }

POST { address, hfTarget, enabled, llmProvider?, llmApiKey? }
  → upsert user_agent_subscriptions
  → if llmApiKey provided: AES-256 encrypt before saving
  → return { success }
```

### B3: `src/app/api/personal-agent/actions/route.ts`

```
GET ?address=0x...&limit=10
  → return last 10 agent_actions for this wallet
  → fields: action, reason, amountUsd, hfBefore, hfAfter, txHash, createdAt
```

### B4: `src/app/api/personal-agent/status/route.ts`

```
GET ?address=0x...
  → read on-chain:
      xUSDC.allowance(address, AgentExecutor) → approvedAmount
      LendingPool.agentAuthorized(address, AgentExecutor) → isAuthorized
      LendingPool.getUserAccountData(address) → hf, debt, collateral
  → return { approvedAmount, isAuthorized, hf, debtUsd, collateralUsd }
```

**CHECKPOINT B:**
```
□ curl /api/personal-agent/settings?address=0x... → returns defaults
□ POST settings → saved to Supabase
□ curl /api/personal-agent/status?address=0x... → returns on-chain data
```

---

## PHASE C — Frontend UI (2h)

### C1: `src/components/agents/PersonalAgentPanel.tsx`

**State machine — 3 states:**

**State 1: Not set up** (no approve / no authorize)
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [INACTIVE]  │
├──────────────────────────────────────────┤
│ Set up your agent in 3 steps:            │
│                                          │
│ ① Approve xUSDC   [APPROVE →]    □      │
│ ② Authorize agent [AUTHORIZE →]  □      │
│ ③ Set HF target   [1.30  ▲▼]           │
│                                          │
│          [ACTIVATE AGENT]               │
└──────────────────────────────────────────┘
```

**State 2: Active, HF safe**
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [● ACTIVE]  │
├──────────────────────────────────────────┤
│ HF now   1.42  →  Target  1.30           │
│ Reserve  2,500 xUSDC approved            │
│ Status   Watching · all safe             │
│                                          │
│ Last:  Deployed $500 to yield · 6h ago  │
│        HF was 1.52, yield 4.2% APY      │
│                                          │
│ [View History]       [Disable]           │
└──────────────────────────────────────────┘
```

**State 3: Agent acted recently**
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [● ACTIVE]  │
├──────────────────────────────────────────┤
│ HF now   1.34  →  Target  1.30           │
│                                          │
│ ⚡ JUST ACTED — 2 minutes ago            │
│   Repaid $230 xUSDC                     │
│   HF: 1.08 → 1.34                       │
│   TX: 0x4f2a...                         │
│                                          │
│ [View History]       [Disable]           │
└──────────────────────────────────────────┘
```

**Polling:** fetch status every 30s, fetch actions every 60s

### C2: `src/components/agents/LLMProviderPanel.tsx` (optional section)

```
┌──────────────────────────────────────────┐
│ AI REASONING (optional)                  │
│                                          │
│ Provider  [None (rule-based) ▼]          │
│           [Gemini            ]           │
│           [OpenAI            ]           │
│           [DeepSeek          ]           │
│           [Custom            ]           │
│                                          │
│ API Key   [•••••••]  [Test]  [Save]     │
│                                          │
│ Without AI: rule-based repay only        │
│ With AI: smarter decisions, market-aware │
└──────────────────────────────────────────┘
```

### C3: Update `AgentsTab.tsx`

```typescript
import { PersonalAgentPanel } from "./PersonalAgentPanel";

export function AgentsTab() {
  return (
    <div>
      <PersonalAgentPanel />
      <CoordinatorPanel />
      <BotStatusPanel />
    </div>
  );
}
```

**CHECKPOINT C:**
```
□ Panel renders correctly when wallet not connected (hidden)
□ Panel shows setup wizard when not configured
□ Approve tx → step 1 checked
□ Authorize tx → step 2 checked
□ Activate → saves to Supabase → status shows ACTIVE
□ History shows last actions
□ Disable → status shows INACTIVE
```

---

## PHASE D — VPS Agent (2h)

### D1: `agents/personal-agent.ts`

```typescript
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Main loop
watchBlocks(async (blockNumber) => {
  if (isRunning) return;
  isRunning = true;
  try {
    await runCycle(blockNumber);
  } finally {
    isRunning = false;
  }
});

async function runCycle(block: bigint) {
  // 1. Load all enabled users from Supabase
  const users = await supabaseAdmin
    .from("user_agent_subscriptions")
    .select("*")
    .eq("enabled", true)
    .eq("agent_type", "personal");

  if (!users.data?.length) return;

  // 2. Batch read HF for ALL users in 1 Multicall3 call
  const positions = await getPositionsBatch(users.data.map(u => u.wallet_address));

  // 3. Process each user
  for (const user of users.data) {
    const pos = positions.find(p => p.address === user.wallet_address);
    if (!pos) continue;

    const hf = Number(pos.healthFactor) / 1e18;

    // Skip if no debt
    if (pos.totalDebtUSD === 0n) continue;

    // Re-check enabled flag before any tx (TOCTOU guard)
    const fresh = await supabaseAdmin
      .from("user_agent_subscriptions")
      .select("enabled")
      .eq("wallet_address", user.wallet_address)
      .single();
    if (!fresh.data?.enabled) continue;

    // Check authorization still valid
    const authorized = await pool.agentAuthorized(user.wallet_address, EXECUTOR_ADDRESS);
    if (!authorized) continue;

    // Check approved amount
    const approved = await xUSDC.allowance(user.wallet_address, EXECUTOR_ADDRESS);

    if (hf < 1.05) {
      // EMERGENCY — skip LLM, act immediately
      await handleEmergency(user, pos, approved);
    } else if (hf < user.hf_target) {
      // NORMAL — repay to restore target
      if (user.llm_api_key_enc) {
        await handleWithLLM(user, pos, approved); // AI decides amount
      } else {
        await handleRuleBased(user, pos, approved); // fixed formula
      }
    } else if (approved > 0n && pos.totalDebtUSD > 0n) {
      // YIELD — deploy idle xUSDC if HF is safe enough
      await handleDeployYield(user, pos, approved);
    }
  }
}

async function handleEmergency(user, pos, approved) {
  // Repay enough to reach hf_target + 0.2
  const target = user.hf_target + 0.2;
  const debtUSD = Number(pos.totalDebtUSD) / 1e18;
  const collUSD = Number(pos.totalWeightedCollateralUSD) / 1e18;
  const repayUSD = Math.max(0, debtUSD - collUSD / target);
  const repayAmount = parseUnits(repayUSD.toFixed(6), 6);

  // Cap at approved amount
  const actual = repayAmount > approved ? approved : repayAmount;
  if (actual === 0n) return;

  const hfBefore = Number(pos.healthFactor) / 1e18;
  const tx = await executor.emergencyProtect(user.wallet_address, actual);
  const receipt = await tx.wait();

  const posAfter = await getUserAccountData(user.wallet_address);
  const hfAfter = Number(posAfter.healthFactor) / 1e18;

  await logAction(user.wallet_address, "emergency_protect", {
    amountUsd: repayUSD,
    hfBefore,
    hfAfter,
    txHash: receipt.hash,
    reason: `HF ${hfBefore.toFixed(2)} < 1.05, emergency repay`,
  });
}

async function handleRuleBased(user, pos, approved) {
  // Same logic as emergency but less urgent
  // ...
}

async function handleDeployYield(user, pos, approved) {
  // Only deploy if HF is safe (> target + 0.3 buffer)
  const hf = Number(pos.healthFactor) / 1e18;
  if (hf < user.hf_target + 0.3) return;

  // Check user's actual wallet balance
  const walletBalance = await xUSDC.balanceOf(user.wallet_address);
  const deployAmount = walletBalance < approved ? walletBalance : approved;
  if (deployAmount < parseUnits("10", 6)) return; // skip dust

  await executor.deployToYield(user.wallet_address, deployAmount);
  await logAction(user.wallet_address, "deploy_yield", { ... });
}

async function logAction(wallet, action, data) {
  await supabaseAdmin.from("agent_actions").insert({
    wallet_address: wallet,
    agent_type: "personal",
    action,
    reason: data.reason,
    amount_usd: data.amountUsd,
    hf_before: data.hfBefore,
    hf_after: data.hfAfter,
    success: true,
    tx_hash: data.txHash,
  });
}
```

### D2: `run-personal-agent.sh`

```bash
#!/bin/bash
cd /root/arcbank
npx ts-node --project tsconfig.hardhat.json agents/personal-agent.ts
```

### D3: Add to `ecosystem.config.js`

```javascript
{
  name: "personal-agent",
  script: "/root/arcbank/run-personal-agent.sh",
  interpreter: "bash",
  cwd: "/root/arcbank",
  restart_delay: 10000,
  max_restarts: 10,
  min_uptime: "15s",
  out_file: "logs/personal-agent-out.log",
  error_file: "logs/personal-agent-err.log",
  log_date_format: "YYYY-MM-DD HH:mm:ss",
  merge_logs: true,
}
```

### D4: VPS deployment

```bash
# Check RAM first
free -m   # phải > 300MB free

git pull origin main
pm2 start ecosystem.config.js --only personal-agent
pm2 logs personal-agent --lines 20
# Must see: "Personal Agent started, watching N users"
```

**CHECKPOINT D:**
```
□ personal-agent starts without errors
□ Logs show "watching N users" (0 is fine if no users enabled yet)
□ RAM after start: free -m still > 100MB
□ pm2 jlist shows personal-agent online
```

---

## PHASE E — Integration Test (30 min)

### E1: Connect wallet → go to AGENTS tab
- Setup wizard shows → Step 1: Approve 2000 xUSDC to AgentExecutor
- Step 2: Authorize AgentExecutor in LendingPool
- Step 3: Set HF target 1.3 → Enable

### E2: Verify agent picks up user
```bash
# VPS
pm2 logs personal-agent --lines 10
# Should see: "watching 1 user: 0x..."
```

### E3: Borrow to create a position
- Deposit 0.1 xclrBTC → Borrow 3000 xUSDC → HF ~1.5

### E4: Agent auto-deploys yield
- Wait 1 block → agent should see idle xUSDC → deployToYield
- Check panel: shows "Deployed $X to yield"

### E5: Simulate dangerous HF (optional)
- Borrow more until HF ~1.1
- Agent should repay within 1 block
- Panel shows "Repaid $X · HF X.XX → X.XX"

**CHECKPOINT E:**
```
□ User can complete setup flow end-to-end
□ Agent monitors user after enable
□ deployToYield executes when idle xUSDC present
□ emergencyProtect executes when HF < 1.05
□ History shows all actions
□ Disable → agent stops acting
```

---

## Edge cases handled

| Scenario | Handling |
|---|---|
| User revokes auth mid-cycle | `agentAuthorized` check before each tx |
| User disables mid-tx | Re-check `enabled` flag before each on-chain action |
| Approved amount < repay needed | Partial repay with available amount |
| No xUSDC in wallet to deploy | `deployToYield` skips if balance < $10 |
| Pool paused | tx reverts gracefully, log error |
| LLM API key expired | Fallback to rule-based, log warning |
| VPS restart | PM2 auto-restarts, resumes from current block |

---

## What this enables (summary)

| Feature | MVP (Phase A-E) | Phase 2 (after) |
|---|---|---|
| Auto-repay when HF low | ✅ rule-based | ✅ + LLM reasoning |
| Auto-deploy idle xUSDC | ✅ | ✅ |
| Full action history | ✅ | ✅ |
| Enable/disable toggle | ✅ | ✅ |
| LLM decisions | ❌ (optional key) | ✅ always |
| Notifications | ❌ | ✅ Telegram |
| Yield rotation (other protocols) | ❌ (no DEX on testnet) | Future |
| Emergency exit (full close) | ❌ | Phase 3 |

---

## Build order

```
Phase A  Supabase + env vars      30 min   ← START HERE
Phase B  API routes                 1h
Phase C  PersonalAgentPanel UI      2h
Phase D  personal-agent.ts VPS      2h
Phase E  Integration test          30 min

Total: ~6h
```
