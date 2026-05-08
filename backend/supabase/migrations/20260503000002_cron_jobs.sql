-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper: call an Edge Function via pg_net
-- update-dominance: every 15 minutes
SELECT cron.schedule(
  'update-dominance',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hfqzsduezngpmxfplnfg.supabase.co/functions/v1/update-dominance',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- take-snapshot: 00:00, 06:00, 12:00, 18:00 UTC every day
SELECT cron.schedule(
  'take-snapshot',
  '0 0,6,12,18 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hfqzsduezngpmxfplnfg.supabase.co/functions/v1/take-snapshot',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- cleanup-territories: daily at 03:00 UTC
SELECT cron.schedule(
  'cleanup-territories',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hfqzsduezngpmxfplnfg.supabase.co/functions/v1/cleanup-territories',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- manage-ephemeral: Monday 06:00 UTC
SELECT cron.schedule(
  'manage-ephemeral',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://hfqzsduezngpmxfplnfg.supabase.co/functions/v1/manage-ephemeral',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
