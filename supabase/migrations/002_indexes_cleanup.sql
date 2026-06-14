-- Migration 002: Performance indexes + 30-day data cleanup
-- Run in Supabase Dashboard → SQL Editor

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- agent_actions: most common query is wallet + time range (history, stats)
CREATE INDEX IF NOT EXISTS idx_agent_actions_wallet_created
  ON agent_actions (wallet_address, created_at DESC);

-- agent_actions: action type filter (audit queries by action type)
CREATE INDEX IF NOT EXISTS idx_agent_actions_action_created
  ON agent_actions (action, created_at DESC);

-- agent_memory: wallet + agent_type + type (LLM context fetch, cooldown load)
CREATE INDEX IF NOT EXISTS idx_agent_memory_wallet_type
  ON agent_memory (wallet_address, agent_type, type);

-- agent_memory: created_at for cleanup cron
CREATE INDEX IF NOT EXISTS idx_agent_memory_created
  ON agent_memory (created_at);

-- user_agent_subscriptions: agent_type filter (already has wallet PK, add type idx)
CREATE INDEX IF NOT EXISTS idx_subscriptions_type_enabled
  ON user_agent_subscriptions (agent_type, enabled);

-- ── 30-day cleanup via pg_cron ───────────────────────────────────────────────
-- Requires pg_cron extension (enabled in Supabase by default on Pro plans).
-- Runs daily at 03:00 UTC; deletes records older than 30 days.
-- Keeps 'cooldown' rows forever (no created_at rolloff needed — they're upserted).

SELECT cron.schedule(
  'cleanup-agent-logs-30d',
  '0 3 * * *',
  $$
    DELETE FROM agent_actions
    WHERE created_at < NOW() - INTERVAL '30 days';

    DELETE FROM agent_memory
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND type != 'cooldown';
  $$
);
