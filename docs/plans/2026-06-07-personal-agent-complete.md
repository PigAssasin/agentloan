# Personal Agent — Complete Build Plan (v2)
> Contracts deployed ✓ — UI + Backend + LLM + Telegram
> Created: 2026-06-07 | Updated: 2026-06-07

---

## What this builds

A true autonomous DeFi agent per user:
- **Tier 1 scoring** — every block, $0, decides if action needed
- **Tier 2 LLM** — only on real events, reasons with memory context
- **Atomic execution** — withdrawFor + repayFor in 1 tx (no liquidation gap)
- **Yield deployment** — idle xUSDC auto-supplied to earn APY
- **Telegram integration** — notifications + control commands
- **Per-user memory** — agent learns each user's pattern

---

## Architecture

```
User wallet (MetaMask)
  ↓ approve xUSDC to AgentExecutor (on-chain)
  ↓ authorizeAgent(AgentExecutor, true) in LendingPool (on-chain)

PersonalAgentPanel (UI / Vercel)
  ↓ reads settings from Supabase via API
  ↓ shows HF, last action, history, Telegram link

Telegram Bot
  ↓ /start 0x... → links wallet to chat_id
  ↓ /status /enable /disable /hf 1.4
  ↓ agent sends alerts per user when acting

personal-agent.ts (VPS, PM2)
  Tier 1 (every block):
    Multicall3 → HF all users → flag who needs attention
  Tier 2 (on event):
    LLM reads user memory → reasons → decides amount + action
  Execute:
    AgentExecutor.emergencyProtect() or deployToYield()
    Log to Supabase → notify Telegram

AgentExecutor.sol (on-chain ✓)
  withdrawFor + repayFor atomic (1 tx)
  depositFor (supply to pool)
```

---

## PHASE A — Supabase (30 min)

### A1: Create project
- supabase.com → New project → "agentloan"
- Copy: Project URL, anon key, service role key

### A2: Run SQL

```sql
-- User agent settings per wallet
CREATE TABLE user_agent_subscriptions (
  id               BIGSERIAL PRIMARY KEY,
  wallet_address   TEXT NOT NULL,
  agent_type       TEXT NOT NULL DEFAULT 'personal',

  -- Core config
  hf_target        NUMERIC DEFAULT 1.3,
  enabled          BOOLEAN DEFAULT false,

  -- LLM (user brings own key OR use protocol default)
  llm_provider     TEXT,          -- 'gemini' | 'openai' | 'deepseek' | 'custom' | null
  llm_api_key_enc  TEXT,          -- AES-256 encrypted; null = use protocol Gemini key
  llm_base_url     TEXT,          -- for custom provider

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wallet_address, agent_type)
);

-- Telegram: link wallet ↔ chat_id
CREATE TABLE telegram_connections (
  wallet_address TEXT PRIMARY KEY,
  chat_id        TEXT NOT NULL,
  connected_at   TIMESTAMPTZ DEFAULT now()
);

-- Every action agent takes
CREATE TABLE agent_actions (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  action         TEXT,        -- 'repay' | 'deploy_yield' | 'emergency_protect' | 'skip'
  reason         TEXT,        -- LLM or rule explanation
  amount_usd     NUMERIC,
  hf_before      NUMERIC,
  hf_after       NUMERIC,
  success        BOOLEAN,
  tx_hash        TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Per-user rolling memory (influences LLM decisions)
CREATE TABLE agent_memory (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  agent_type     TEXT NOT NULL DEFAULT 'personal',
  type           TEXT,        -- 'observation' | 'decision' | 'outcome'
  content        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Cleanup functions
CREATE OR REPLACE FUNCTION cleanup_agent_data() RETURNS void AS $$
BEGIN
  -- Keep last 50 memory rows per user
  DELETE FROM agent_memory WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY wallet_address, agent_type ORDER BY created_at DESC
      ) as rn FROM agent_memory
    ) t WHERE rn <= 50
  );
  -- Delete actions older than 30 days
  DELETE FROM agent_actions
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

### A3: Install + env vars

```bash
npm install @supabase/supabase-js
```

```bash
# .env.local (local + VPS)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # server-side only
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # browser safe

# Telegram bot (same bot token as existing notifier)
TELEGRAM_BOT_TOKEN=xxx                 # already in .env.local
# No TELEGRAM_CHAT_ID needed — per-user now
```

**CHECKPOINT A:**
```
□ 4 tables created in Supabase
□ .env.local updated local + VPS
□ npm install @supabase/supabase-js succeeds
□ node -e "require('@supabase/supabase-js')" → no error
```

---

## PHASE B — API Routes (1h)

### B1: `src/lib/supabase.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### B2: `src/app/api/personal-agent/settings/route.ts`

```
GET  ?address=0x...
  → load user_agent_subscriptions
  → return { enabled, hfTarget, llmProvider, hasLlmKey, hasTelegram }

POST { address, hfTarget, enabled, llmProvider?, llmApiKey? }
  → upsert user_agent_subscriptions
  → if llmApiKey provided: AES-256 encrypt before saving
```

### B3: `src/app/api/personal-agent/actions/route.ts`

```
GET ?address=0x...&limit=10
  → last 10 agent_actions for this wallet
```

### B4: `src/app/api/personal-agent/status/route.ts`

```
GET ?address=0x...
  → on-chain reads:
      xUSDC.allowance(address, AgentExecutor) → approvedAmount
      LendingPool.agentAuthorized(address, AgentExecutor) → isAuthorized
      LendingPool.getUserAccountData(address) → hf, debt, collateral
  → return { approvedAmount, isAuthorized, hf, debtUsd, collateralUsd }
```

### B5: `src/app/api/telegram/webhook/route.ts` ← NEW

Handles Telegram bot commands from users:

```typescript
export async function POST(req: Request) {
  const body = await req.json();
  const msg  = body.message;
  if (!msg) return Response.json({ ok: true });

  const chatId = msg.chat.id.toString();
  const text   = msg.text?.trim() ?? "";

  // /start 0xABC... → link wallet to this chat
  if (text.startsWith("/start ")) {
    const wallet = text.slice(7).trim().toLowerCase();
    if (wallet.startsWith("0x") && wallet.length === 42) {
      await supabaseAdmin.from("telegram_connections").upsert({
        wallet_address: wallet,
        chat_id: chatId,
      });
      await sendTelegram(chatId, `✅ Wallet linked!\n<code>${wallet}</code>\n\nCommands:\n/status — HF and agent state\n/enable — turn on agent\n/disable — turn off agent\n/hf 1.4 — set HF target`);
    }
    return Response.json({ ok: true });
  }

  // Find wallet for this chat_id
  const { data: conn } = await supabaseAdmin
    .from("telegram_connections")
    .select("wallet_address")
    .eq("chat_id", chatId)
    .single();

  if (!conn) {
    await sendTelegram(chatId, "Send /start 0xYOUR_WALLET to link your wallet first.");
    return Response.json({ ok: true });
  }

  const wallet = conn.wallet_address;

  if (text === "/status") {
    const sub = await getSubscription(wallet);
    const pos = await getUserAccountData(wallet);
    const hf = Number(pos.healthFactor) / 1e18;
    await sendTelegram(chatId, formatStatus(wallet, sub, hf));
  }
  else if (text === "/enable") {
    await setEnabled(wallet, true);
    await sendTelegram(chatId, "✅ Personal Agent enabled. Watching your position.");
  }
  else if (text === "/disable") {
    await setEnabled(wallet, false);
    await sendTelegram(chatId, "⏸ Personal Agent disabled.");
  }
  else if (text.startsWith("/hf ")) {
    const target = parseFloat(text.slice(4));
    if (target >= 1.1 && target <= 3.0) {
      await setHFTarget(wallet, target);
      await sendTelegram(chatId, `✅ HF target set to ${target}`);
    } else {
      await sendTelegram(chatId, "HF target must be between 1.1 and 3.0");
    }
  }

  return Response.json({ ok: true });
}
```

### B6: Register Telegram webhook (run once after deploy)

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://agentloan.vercel.app/api/telegram/webhook"
```

**CHECKPOINT B:**
```
□ GET /api/personal-agent/settings → returns data
□ POST /api/personal-agent/settings → saves to Supabase
□ GET /api/personal-agent/status → returns on-chain data
□ Telegram: send /start 0x... to bot → receives welcome message
□ Telegram: /enable /disable /status all respond correctly
```

---

## PHASE C — Frontend UI (2h)

### C1: `src/components/agents/PersonalAgentPanel.tsx`

**State 1: Not set up**
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [INACTIVE]  │
├──────────────────────────────────────────┤
│ Autonomous position management — set up  │
│ once and your agent works 24/7.          │
│                                          │
│ ① Approve xUSDC   [APPROVE →]    ○      │
│ ② Authorize agent [AUTHORIZE →]  ○      │
│ ③ Set HF target   [1.30  ▲▼]           │
│                                          │
│           [ACTIVATE AGENT]              │
└──────────────────────────────────────────┘
```

**State 2: Active, safe**
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [● ACTIVE]  │
├──────────────────────────────────────────┤
│ HF now   1.42  →  Target  1.30           │
│ Reserve  2,500 xUSDC approved            │
│                                          │
│ Deployed $500 to yield · 6h ago          │
│ APY: 4.2% · HF was 1.52                 │
│                                          │
│ [Telegram ✓]  [History]  [Disable]      │
└──────────────────────────────────────────┘
```

**State 3: Just acted**
```
┌──────────────────────────────────────────┐
│ PERSONAL AGENT               [● ACTIVE]  │
├──────────────────────────────────────────┤
│ HF now   1.34  →  Target  1.30           │
│                                          │
│ ⚡ Repaid $230 xUSDC · 2 min ago         │
│   HF: 1.08 → 1.34                       │
│   TX: 0x4f2a... [↗]                    │
│                                          │
│ [Telegram ✓]  [History]  [Disable]      │
└──────────────────────────────────────────┘
```

**Telegram connect flow (in panel):**
```
[Connect Telegram] →
  Show: "Message @AgentLoanBot: /start 0xYOUR_WALLET"
  QR code or deep link: tg://resolve?domain=AgentLoanBot&start=0x...
  Poll every 5s for connection → shows ✓ when linked
```

**LLM section (collapsible, bottom of panel):**
```
▼ AI Reasoning (optional)
  Using: Protocol default (Gemini)
  [Use my own API key ▼]
    Provider: [Gemini ▼]
    API Key:  [••••••] [Test] [Save]
```

### C2: Update `AgentsTab.tsx`

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
□ Setup wizard: approve → authorize → activate works end-to-end
□ Panel shows correct HF and agent status
□ Telegram connect: user links wallet → panel shows ✓
□ LLM section: user can save their own API key
□ History shows last 10 actions
□ Disable toggles agent off (Supabase updated)
```

---

## PHASE D — VPS Agent (2h)

### D1: Two-tier decision engine

**Tier 1 — Scoring (every block, $0):**
```
For each user:
  hf = current health factor
  hfDelta = hf - previousHF (trend)
  urgency = 0

  if hf < 1.05: urgency = 3  (emergency)
  elif hf < hfTarget: urgency = 2  (needs action)
  elif hfDelta < -0.1 in last 10min: urgency = 1  (trending bad)
  elif hasIdleUSDC and hf > hfTarget + 0.3: urgency = -1  (deploy yield)
  else: urgency = 0  (skip)

  if urgency === 0: continue
  queue.push({ user, urgency, hf, hfDelta })
```

**Tier 2 — LLM (only when urgency > 0 AND timeSinceLastCall > 5min):**
```typescript
async function decideLLM(user, position, memory): Promise<Decision> {
  const prompt = `
You are a DeFi agent managing ${user.wallet_address}'s position on AgentLoan.

CURRENT STATE:
- Health Factor: ${hf.toFixed(3)} (target: ${user.hf_target})
- HF trend: ${hfDelta > 0 ? "improving" : "declining"} (${hfDelta.toFixed(3)} last 10 min)
- Total debt: $${debtUSD.toFixed(0)}
- Collateral: $${collateralUSD.toFixed(0)}
- xUSDC approved to agent: $${approvedUSD.toFixed(0)}
- BTC price change 1h: ${btcChange1h}%

USER MEMORY (last ${memory.length} observations):
${memory.map(m => `- ${m.content}`).join("\n")}

AVAILABLE ACTIONS:
1. repay(amount) — repay xUSDC debt, improves HF
2. deploy_yield(amount) — supply xUSDC to pool, earn APY
3. skip — do nothing this cycle

Decide: which action, how much, and why.
Respond in JSON: {"action": "repay"|"deploy_yield"|"skip", "amount_usd": number, "reason": "..."}
  `.trim();

  const response = await llmClient.complete(prompt);
  return JSON.parse(response);
}
```

**Fallback when no LLM key AND not emergency:**
```typescript
// Rule-based: simple formula
function decideRuleBased(user, hf): Decision {
  if (hf < user.hf_target) {
    const target = user.hf_target + 0.15;
    const repayUSD = Math.max(0, debtUSD - collateralUSD / target);
    return { action: "repay", amountUsd: repayUSD, reason: "HF below target (rule-based)" };
  }
  if (hasIdleUSDC && hf > user.hf_target + 0.3) {
    return { action: "deploy_yield", amountUsd: idleUSDC, reason: "Idle xUSDC, HF safe" };
  }
  return { action: "skip", amountUsd: 0, reason: "No action needed" };
}
```

### D2: Memory integration

After each action, save to memory AND read last 10 memories for next LLM call:

```typescript
// Save outcome to memory
await supabaseAdmin.from("agent_memory").insert({
  wallet_address: user.wallet_address,
  agent_type: "personal",
  type: "outcome",
  content: `${action}: $${amountUsd} repaid. HF ${hfBefore.toFixed(2)}→${hfAfter.toFixed(2)}. ${reason}`,
});

// Read memory for next LLM call
const { data: memories } = await supabaseAdmin
  .from("agent_memory")
  .select("content")
  .eq("wallet_address", user.wallet_address)
  .order("created_at", { ascending: false })
  .limit(10);
```

### D3: Telegram notification per user

```typescript
async function notifyUser(wallet: string, message: string) {
  const { data: conn } = await supabaseAdmin
    .from("telegram_connections")
    .select("chat_id")
    .eq("wallet_address", wallet)
    .single();

  if (!conn) return; // user not connected to Telegram

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: conn.chat_id,
      text: message,
      parse_mode: "HTML",
    }),
  });
}

// Example notification
await notifyUser(wallet, [
  `⚡ <b>Agent acted on your position</b>`,
  ``,
  `Action: Repaid $${amountUsd.toFixed(0)} xUSDC`,
  `HF: ${hfBefore.toFixed(2)} → ${hfAfter.toFixed(2)}`,
  `Reason: ${reason}`,
  `TX: <a href="https://testnet.arcscan.app/tx/${txHash}">${txHash.slice(0,14)}...</a>`,
].join("\n"));
```

### D4: Full agent loop structure

```typescript
// personal-agent.ts
watchBlocks(async (block) => {
  if (isRunning) return;
  isRunning = true;
  try {
    // Load enabled users
    const users = await getEnabledUsers();
    if (!users.length) return;

    // Tier 1: batch HF read + score
    const positions = await getPositionsBatch(users.map(u => u.wallet_address));
    const queue = scoreAll(users, positions);
    if (!queue.length) return;

    // Tier 2: LLM or rule-based for each user in queue
    for (const item of queue) {
      const { user, urgency, position } = item;

      // TOCTOU: re-check enabled + auth
      if (!await isStillEnabled(user.wallet_address)) continue;
      if (!await isStillAuthorized(user.wallet_address)) continue;

      const approved = await getAllowance(user.wallet_address);

      let decision: Decision;
      if (urgency >= 3) {
        // Emergency — no LLM, act NOW
        decision = { action: "emergency_protect", amountUsd: calcRepayAmount(user, position) };
      } else if (shouldCallLLM(user)) {
        const memory = await getMemory(user.wallet_address);
        decision = await decideLLM(user, position, memory);
        updateLastLLMCall(user.wallet_address);
      } else {
        decision = decideRuleBased(user, position);
      }

      if (decision.action === "skip") continue;

      await execute(user, decision, position, approved);
    }
  } finally {
    isRunning = false;
  }
});
```

### D5: `run-personal-agent.sh` + `ecosystem.config.js`

```bash
#!/bin/bash
cd /root/arcbank
npx ts-node --project tsconfig.hardhat.json agents/personal-agent.ts
```

```javascript
// ecosystem.config.js — add this entry
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

**CHECKPOINT D:**
```
□ personal-agent starts: "Personal Agent started, watching N users"
□ RAM after start: free -m > 100MB
□ Tier 1 scoring logs every block (no error)
□ Tier 2 LLM called when HF drops (check logs)
□ Action logged to Supabase agent_actions
□ Telegram notification sent after action
```

---

## PHASE E — Integration Test (30 min)

### E1: Full setup flow
```
Connect wallet → AGENTS tab
→ Setup: Approve 2000 xUSDC + Authorize AgentExecutor + Set HF 1.3 + Enable
→ Telegram: /start 0xYOUR_WALLET → connected ✓
```

### E2: Verify monitoring
```bash
pm2 logs personal-agent --lines 10
# Must see: "watching 1 user: 0x..."
```

### E3: deployToYield test
```
Deposit 0.1 BTC collateral → Borrow 1000 xUSDC
Keep 2000 xUSDC in wallet (idle)
Wait 1-2 blocks
→ Agent deploys $2000 to yield
→ Panel shows "Deployed $2,000 · APY 4.2%"
→ Telegram: "Agent deployed $2,000 to yield"
```

### E4: Auto-repay test
```
Borrow more until HF ~1.15
→ Agent detects HF < target
→ LLM decides repay amount
→ emergencyProtect() executes
→ HF improves
→ Panel shows action + TX
→ Telegram notification sent
```

### E5: Telegram control test
```
/disable → panel shows INACTIVE, agent stops
/enable → agent resumes
/hf 1.5 → threshold changes, agent respects it
/status → shows current HF and agent state
```

**CHECKPOINT E — DONE when:**
```
□ Full setup works end-to-end
□ deployToYield executes automatically
□ Auto-repay executes when HF below target
□ Telegram notified after every action
□ Telegram commands work (enable/disable/status/hf)
□ Action history visible in UI
□ LLM reasons with user memory context
```

---

## Edge cases

| Scenario | Handling |
|---|---|
| User revokes authorization | Check `agentAuthorized` before each tx → skip |
| User disables mid-tx | Re-check `enabled` before every on-chain action |
| Approved amount < repay needed | Partial repay with available amount |
| No xUSDC to repay | Log "insufficient reserve", send Telegram warning |
| LLM API fails | Fallback to rule-based, log warning |
| LLM key expired/invalid | Same fallback, notify user via Telegram |
| Pool paused | Tx reverts gracefully, log error, notify user |
| VPS restart | PM2 auto-restarts, resumes next block |
| Telegram chat not connected | Notifications silently skip |
| Multiple users, same block | Parallel Multicall3 read, sequential execute |

---

## LLM cost at scale

```
Tier 1 (every block):  $0 — pure TypeScript math
Tier 2 (only on event):
  Trigger conditions:
    HF dropped > 0.1 in 10 min
    HF < hf_target + 0.15
    New idle xUSDC detected
  Minimum 5 min between LLM calls per user
  
  Cost:
    Gemini 2.5 Flash: ~$0.0001/call
    1 user, 5 events/day = $0.0005/day
    100 users, 5 events/day each = $0.05/day = $1.50/month
    ← negligible
```

---

## Telegram commands reference

| Command | What it does |
|---|---|
| `/start 0x...` | Link wallet address to this chat |
| `/status` | Show HF, agent state, last action |
| `/enable` | Turn on Personal Agent |
| `/disable` | Turn off Personal Agent |
| `/hf 1.4` | Set HF target to 1.4 |
| `/history` | Last 5 actions |

---

## Build order

```
Phase A  Supabase setup + env vars       30 min  ← START
Phase B  API routes + Telegram webhook    1h
Phase C  PersonalAgentPanel UI            2h
Phase D  personal-agent.ts (2-tier)       2h
Phase E  Integration test                30 min

Total: ~6h
```

---

## What makes this a real agent (not just automation)

| Property | This agent |
|---|---|
| **Perceives** environment | ✅ reads HF, prices, wallet balance every block |
| **Reasons** about actions | ✅ Tier 2 LLM with market context + memory |
| **Remembers** past decisions | ✅ rolling memory → injected into LLM prompt |
| **Learns** user patterns | ✅ memory captures user behavior over time |
| **Acts** autonomously | ✅ executes on-chain without user intervention |
| **Communicates** results | ✅ Telegram notifications after every action |
| **Responds** to user control | ✅ Telegram commands enable/disable/config |
| **Adapts** decisions | ✅ LLM considers current market + user history |
