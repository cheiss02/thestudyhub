-- =====================================================================
-- Runs the "cleanup" function every 15 minutes: session reminders
-- (1 day and 1 hour before) and the 30-day photo cleanup.
-- 1. Supabase → Database → Extensions: pg_cron and pg_net turned on.
-- 2. Replace YOUR-CRON-SECRET below with your CRON_SECRET, then run this in the SQL Editor.
--    Safe to run again: it replaces the old daily job.
-- =====================================================================
do $$ begin perform cron.unschedule('studyhub-daily-cleanup'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('studyhub-every-15-min'); exception when others then null; end $$;

select cron.schedule(
  'studyhub-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://ekjyotgllvleiupzawog.supabase.co/functions/v1/cleanup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body    := '{}'::jsonb
  );
  $$
);

-- Check it: select jobname, schedule from cron.job;
