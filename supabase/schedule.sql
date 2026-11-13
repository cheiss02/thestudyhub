-- =====================================================================
-- Run the photo cleanup every day at 3:15 am California time (11:15 UTC).
-- 1. Supabase → Database → Extensions: turn on pg_cron and pg_net.
-- 2. Replace YOUR-CRON-SECRET below with your CRON_SECRET, then run this in the SQL Editor.
-- =====================================================================
select cron.schedule(
  'studyhub-daily-cleanup',
  '15 11 * * *',
  $$
  select net.http_post(
    url     := 'https://ekjyotgllvleiupzawog.supabase.co/functions/v1/cleanup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body    := '{}'::jsonb
  );
  $$
);
