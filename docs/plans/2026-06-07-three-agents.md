# Three-Agent Architecture — Build Plan
> Status: DRAFT — do not implement until reviewed
> Created: 2026-06-07

---

## Overview

Consolidate 5 existing agents into 3 with clear roles:

| Agent | Replaces | Who uses it |
|---|---|---|
| Personal Autopilot | Guardian + YieldOptimizer | User with open position |
| Hunter Agent | LiquidationBot + SignalAgent | Expert liquidator |
| Protocol Manager | Coordinator + OracleKeeper | Protocol itself (no user) |

---

## Phase 0 — Infrastructure (required before anything else)

### 0A. Supabase setup

Tables:
```sql
user_agents (
  wallet_address    TEXT PRIMARY KEY,
  circle_wallet_id  TEXT,
  circle_wallet_addr TEXT,
  llm_provider      TEXT,          -- gemini | openai | deepseek | custom
  llm_api_key_enc   TEXT,          -- AES-256 encrypted
  llm_base_url      TEXT,          -- for custom provider
  hf_target         NUMERIC,
  goals             JSONB,
  enabled           BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
)

agent_memory (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT,
  type           TEXT,             -- observation | decision | outcome
  content        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
)

agent_actions (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT,
  agent          TEXT,             -- personal | hunter | protocol
  action         TEXT,             -- repay | compound | liquidate | alert
  amount_usd     NUMERIC,
  hf_before      NUMERIC,
  hf_after       NUMERIC,
  success        BOOLEAN,
  tx_hash        TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
)

hunter_strategies (
  wallet_address  TEXT PRIMARY KEY,
  filter_collat   TEXT[],          -- ["xclrBTC"] or [] for all
  min_profit_usd  NUMERIC,
  hf_trigger      NUMERIC,
  post_action     TEXT,            -- hold | compound (no "sell" — no DEX)
  enabled         BOOLEAN DEFAULT false,
  updated_at      TIMESTAMPTZ DEFAULT now()
)
```

Cleanup cron (run nightly):
- Keep last 50 rows per user in `agent_memory`
- Delete `agent_actions` older than 30 days

### 0B. `agents/lib/llm-client.ts` — pluggable LLM

Single interface for all providers (all support OpenAI format):
```typescript
interface LLMConfig {
  provider: "gemini" | "openai" | "deepseek" | "custom"
  apiKey: string
  baseURL?: string   // for custom
}

// Per-user cache: Map<walletAddress, { lastHash, lastCall }>
// NOT module-level variable — fixes A1-2
export function createLLMClient(config: LLMConfig, userId: string): LLMClient
```

Fallback: if LLM call fails → use scoring function only (rule-based), log error, do NOT crash.

---

## Phase 1 — Personal Autopilot Agent

### Critical issues to fix first (from review):

**A1-1 / A1-3 — Capital source for repay**
Agent wallet holds xUSDC un-supplied (raw ERC-20 balance). Do NOT withdraw from pool to repay — that worsens HF mid-action. Keep a "repay reserve" in the Circle wallet separate from supplied collateral.

**A1-2 — Per-user LLM cache**
Use `Map<walletAddress, stateHash>` not module-level variable.

**A1-5 — TOCTOU on enable flag**
Re-check `enabled` in Supabase immediately before any on-chain tx.

**A1-8 — Circle wallet ID from Supabase**
Read `circle_wallet_id` per user from Supabase, not from `process.env`.

**A1-9 — Use block-based trigger, not wall clock**
Subscribe to `watchBlocks`. On each block, batch-read all enabled users' HF via Multicall3 (1 call total). Only trigger per-user logic if HF changed meaningfully (>0.05 delta).

**Remove A1-10 (yield rotation)**
No DEX on Arc testnet. Remove from scope. Only: repay, compound (re-deposit earned interest), emergency exit.

### Architecture:

```
personal-agent.ts (VPS, PM2)
  watchBlocks → every block
    Multicall3: get HF for all enabled users (1 RPC call)
    For each user where HF changed:
      Load user config from Supabase
      if !enabled → skip
      if HF < emergencyThreshold (1.05) → fast-path: repay immediately, no LLM
      if HF changed > 0.05 → call user's LLM with context
        LLM decides: repay / compound / do nothing
        Execute via user's Circle wallet (wallet_id from Supabase)
        Write result to agent_actions
        Update agent_memory (rolling 50)
```

### Fast-path (no LLM):
```
HF < 1.05 → skip LLM, repay immediately using pre-approved repay reserve
Reason: LLM takes 2-3s, HF 1.05 can cross 1.0 before LLM responds
```

### UI components:
```
PersonalAgentPanel.tsx
  - Create Agent Wallet button (calls /api/personal-agent/create-wallet)
  - Deposit / Withdraw xUSDC button
  - Enable / Disable toggle → writes Supabase → agent picks up next cycle
  - LLM provider selector + API key input (calls /api/personal-agent/set-llm)
  - HF target input
  - Status: last action, HF now, wallet balance

LLMProviderPanel.tsx (reusable)
  - Provider dropdown: Gemini / OpenAI / DeepSeek / Custom
  - API key input + Test button (calls LLM with test prompt)
  - Base URL input (for custom)
```

---

## Phase 2 — Hunter Agent

### Critical issues to fix first:

**A2-2 — Remove postAction: sell**
No DEX. Only `hold` and `compound`. Compound means re-deposit xUSDC bonus into pool as supply.

**A2-6 — Auth for start/stop endpoint**
Require `Authorization: Bearer <wallet_signature>` — user signs a nonce with their wallet. Signal server verifies signature against the `wallet_address` in `hunter_strategies`. No unauthenticated PM2 control.

**A2-8 — Hunter's own HF if compounding**
If postAction is `compound`, check: will depositing xUSDC create a borrow position? No — supply-only is safe. But monitor hunter's own HF if they ever borrow.

**A2-1 — Multiple hunters, same target**
No coordination mechanism possible on-chain. Accept competition. Document clearly: "first tx wins, second wastes gas." Hunters with faster infra or better signal subscriptions win.

### Architecture:

```
hunter-agent.ts (VPS, separate PM2 process per hunter wallet)
  Start: read strategy from Supabase (hunter_strategies)
  Subscribe to Signal Agent (x402, 1 xUSDC/24h)
  On signal (HF < 1.1):
    Re-check HF on-chain (don't trust stale signal)
    Apply strategy filter: collateral type, min profit estimate
    If passes: approve → liquidate → postAction
    Write to agent_actions
```

### UI:
```
HunterAgentPanel.tsx
  - Strategy builder: collateral filter, min profit, HF trigger
  - postAction selector: hold / compound
  - Signal subscription status (active session / expired)
  - Start / Stop button (signed request to Signal server)
  - P&L tracker: total liquidated, total profit, success rate
```

---

## Phase 3 — Protocol Manager

### Critical issues to fix first:

**A3-1 — Deduplicate oracle keeper**
Remove oracle update from `liquidation-bot.ts`. Move to Protocol Manager exclusively. One process, one wallet, no nonce conflicts.

**A3-2 — Daily LLM budget counter**
Store `llm_calls_today` + `llm_reset_date` in a state file or Supabase. Hard cap at 25 calls/day across all Protocol Manager LLM calls.

**A3-3 — External watchdog**
Protocol Manager cannot watch itself. Use PM2's built-in restart + a simple external ping: UptimeRobot (free) pings `/v1/health` on Signal server every 5 min. If Signal server is down, UptimeRobot emails/alerts. Not perfect but cheap.

**A3-6 — Per-token oracle staleness check**
Check staleness for each token separately (BTC, EUR, USDC), not just xUSDC.

**A3-8 — Heartbeat file**
Protocol Manager writes `agents/state/protocol-manager-heartbeat.json` with `{ lastAlive: timestamp }` every cycle. Signal server exposes this as `/v1/health`.

### Architecture (3 separate loops in 1 process):

```
protocol-manager.ts (VPS, PM2)

Loop A — Oracle keeper (every 15s)
  Check if any price stale → push Pyth update
  Write heartbeat

Loop B — Coordinator AI (every 30s)  
  Scoring function: rank ALL positions ($0, unlimited)
  Event check: BTC/collateral >1.5% OR new HF < 1.05
  If event AND budget remaining: call LLM (top 10 only)
  Write coordinator.json

Loop C — Health monitor (every 60s)
  Check utilization rate (alert if >85%)
  Check bad debt (compare all positions)
  Check oracle staleness per token
  Check known-borrowers.json age
  Alert via Telegram if issues
```

---

## Known limitations (accept for now)

| Issue | Accept? | Reason |
|---|---|---|
| No sell after liquidation | Yes | No DEX on Arc testnet |
| Multiple hunters compete, no coordination | Yes | On-chain = permissionless |
| Protocol Manager can't self-monitor | Partial | PM2 + UptimeRobot as external watchdog |
| Circle wallet custody risk | Yes (testnet) | Document clearly for users |
| JSON state files not atomic | Later | Switch to Supabase for all shared state in Phase 3 |

---

## Build order

```
① Phase 0A  — Supabase tables
② Phase 0B  — llm-client.ts (pluggable)
③ Phase 1   — Personal Agent (basic: repay + compound)
④ Phase 2   — Hunter Agent (strategy framework + web control)
⑤ Phase 3   — Protocol Manager (split oracle keeper out of bot)
```
