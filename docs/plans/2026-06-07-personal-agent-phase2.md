# Personal Agent — Phase 2: UI + Backend
> Contracts deployed ✓ — Now building the user-facing layer
> Created: 2026-06-07

---

## Contract foundation (done)

| Contract | Address | Status |
|---|---|---|
| LendingPool v3 | 0xA5F8E24a5a97e9cA763D0FB4777786B684Aceb9B | ✅ deployed |
| PriceOraclePyth v3 | 0x440B0f69AADd464d88ED205191ed1a45374bCCF6 | ✅ EUR 30d staleness |
| AgentExecutor | 0x81E1d5F98e2804be55190610Dcb6DbB71E9CABdA | ✅ bot authorized |
| Pool liquidity | 10M xUSDC + 10M xEURC + 100 xclrBTC | ✅ seeded |
| Tests | 80 passing | ✅ |

---

## What needs to be built

```
User opens AGENTS tab
  → sees "PERSONAL AGENT" panel
  → clicks "Setup" → approves xUSDC + authorizes AgentExecutor
  → sets HF target (e.g. 1.3)
  → toggles ON

Agent runs on VPS:
  → monitors HF every block
  → HF drops → emergencyProtect() atomic tx
  → idle xUSDC in wallet → deployToYield()
  → logs every action to Supabase
```

---

## PHASE A — Supabase (30 min, no code changes)

### A1: Create Supabase project
- Go to supabase.com → New project → name: "agentloan"
- Copy: Project URL, anon key, service role key

### A2: Create tables (run in SQL editor)

```sql
CREATE TABLE user_agent_subscriptions (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  hf_target      NUMERIC DEFAULT 1.3,
  enabled        BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wallet_address, agent_type)
);

CREATE TABLE agent_actions (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  action         TEXT,
  amount_usd     NUMERIC,
  hf_before      NUMERIC,
  hf_after       NUMERIC,
  success        BOOLEAN,
  tx_hash        TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_memory (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  content        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Cleanup: keep last 50 memory per user
-- Cleanup: delete actions older than 30 days
```

### A3: Add env vars
```
# .env.local
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # server-side only
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**CHECKPOINT A:** Tables created, env vars set, `npm install @supabase/supabase-js`

---

## PHASE B — API Routes (backend, ~1h)

### B1: `src/app/api/personal-agent/settings/route.ts`

```
GET  ?address=0x...  → load user settings from Supabase
POST { address, hfTarget, enabled } → save settings
```

### B2: `src/app/api/personal-agent/actions/route.ts`

```
GET ?address=0x...&limit=10 → last 10 actions from Supabase
```

### B3: `src/app/api/personal-agent/setup/route.ts`

```
POST { address } → check if user has approved AgentExecutor
→ return { approved: bool, approvedAmount: string }
```

**CHECKPOINT B:** API routes return data, test with curl

---

## PHASE C — Frontend UI (~2h)

### C1: `src/components/agents/PersonalAgentPanel.tsx`

Layout:
```
┌─────────────────────────────────────────────────┐
│ PERSONAL AGENT                       [● ACTIVE] │
├─────────────────────────────────────────────────┤
│ Status: Watching your position                  │
│ HF now: 1.42  →  Target: 1.30                  │
│                                                  │
│ SETUP (if not configured):                       │
│  Step 1 [Approve xUSDC →]  ✓                   │
│  Step 2 [Authorize Agent →] ✓                  │
│  Step 3 [Set HF Target: 1.3 ▲▼]               │
│         [Enable Agent]                          │
│                                                  │
│ LAST ACTIONS:                                    │
│  Repaid $230 xUSDC · HF 1.08→1.34 · 2h ago    │
│  Deployed $500 to yield · APY 4.2% · 1d ago    │
│                                                  │
│ [View All]  [Disable Agent]                     │
└─────────────────────────────────────────────────┘
```

Key behaviors:
- Wallet not connected → hide panel
- Not set up → show 3-step setup wizard
- Enabled → show live HF + last action
- Agent running but no action needed → "Watching · HF safe"

### C2: Update `AgentsTab.tsx`

```typescript
import { PersonalAgentPanel } from "./PersonalAgentPanel";

export function AgentsTab() {
  return (
    <div>
      <PersonalAgentPanel />   ← add here
      <CoordinatorPanel />
      <BotStatusPanel />
    </div>
  );
}
```

**CHECKPOINT C:** UI renders, approve + authorize flow works, settings save to Supabase

---

## PHASE D — VPS Agent (`personal-agent.ts`, ~2h)

### D1: `agents/personal-agent.ts`

```
Main loop (watchBlocks):
  1. Batch read HF for all enabled users (Multicall3, 1 RPC call)
  2. For each user where HF changed:
     a. HF < 1.05 → emergencyProtect() immediately (skip LLM)
     b. HF < hf_target → repay enough to reach hf_target + 0.1
     c. User has idle xUSDC approved → deployToYield()
  3. Log all actions to Supabase
  4. Update agent_memory (rolling 50)
```

Critical details:
- Use `agentAuthorized` check before acting (skip if user revoked)
- Re-check `enabled` in Supabase before each on-chain tx
- Use AgentExecutor contract for all actions
- Dotenv: `path.resolve(__dirname, "../.env.local")`

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
  out_file: "logs/personal-agent-out.log",
  error_file: "logs/personal-agent-err.log",
}
```

### D4: VPS deployment

```bash
# Check RAM before starting
free -m  # must have > 300MB free

# Deploy
cd /root/arcbank
git pull origin main
pm2 start ecosystem.config.js --only personal-agent
pm2 logs personal-agent --lines 20
```

**CHECKPOINT D:** Agent starts, logs "Watching N users", no errors

---

## PHASE E — Integration test (~30 min)

### E1: Connect wallet → open AGENTS tab
- Setup wizard appears → approve xUSDC → authorize AgentExecutor → enable

### E2: Verify agent monitors your position
- Borrow xUSDC → check HF appears in panel
- Agent logs "monitoring 1 user" in VPS logs

### E3: Simulate low HF
- Borrow more until HF ~1.1
- Agent should detect → call emergencyProtect()
- HF improves → action appears in history

**CHECKPOINT E:** Full flow working end-to-end

---

## Build order

```
PHASE A  Supabase setup          ← start here (30 min, no code)
PHASE B  API routes              ← 1h, Next.js only
PHASE C  PersonalAgentPanel UI   ← 2h, React
PHASE D  personal-agent.ts       ← 2h, VPS agent
PHASE E  Integration test        ← 30 min
```

**Total estimate: ~6h**

---

## What this enables vs current state

| Feature | Now | After |
|---|---|---|
| User sees agent panel | ❌ | ✅ |
| User approves + authorizes | ❌ | ✅ (on-chain) |
| Agent monitors HF | ❌ | ✅ (every block) |
| Auto-repay when HF low | ❌ | ✅ (atomic, 1 tx) |
| Deploy idle xUSDC to yield | ❌ | ✅ |
| Action history visible | ❌ | ✅ (Supabase) |
| Enable/disable toggle | ❌ | ✅ |
