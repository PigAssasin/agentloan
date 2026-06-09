-- Protocol Manager metrics table
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/wcxanzfayobrwtutilak/sql

CREATE TABLE IF NOT EXISTS protocol_metrics (
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
  liquidatable_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_protocol_metrics_recorded_at ON protocol_metrics(recorded_at DESC);

-- Optional: auto-cleanup rows older than 30 days (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-metrics','0 4 * * *',$$
--   DELETE FROM protocol_metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
-- $$);
