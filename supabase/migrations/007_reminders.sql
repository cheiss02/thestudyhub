-- =====================================================================
-- Update 007: reminder emails 1 day and 1 hour before each approved session,
-- to the family and the tutor.
-- Run once: Supabase → SQL Editor → paste → Run.
-- =====================================================================

alter table public.requests
  add column if not exists reminded_24h_at timestamptz,
  add column if not exists reminded_1h_at  timestamptz;

-- Sessions that need a reminder right now. Only the server (secret key) can call this.
create or replace function public.due_reminders()
returns table (id uuid, kind text)
language sql stable security definer set search_path = public as $$
  with s as (
    select r.*, ((r.session_date + r.slot::time) at time zone 'America/Los_Angeles') as starts
    from public.requests r
    where r.status = 'approved' and r.completed_at is null
  )
  -- 1 hour before (sent once, any time in the last hour before the start)
  select s.id, '1h' from s
   where s.reminded_1h_at is null
     and s.starts > now() and s.starts <= now() + interval '65 minutes'
  union all
  -- 1 day before (skipped if the session was approved less than a day ahead:
  -- the family just got the approval email)
  select s.id, '24h' from s
   where s.reminded_24h_at is null
     and s.starts > now() + interval '2 hours' and s.starts <= now() + interval '24 hours'
     and (s.responded_at is null or s.responded_at < s.starts - interval '23 hours');
$$;
revoke execute on function public.due_reminders() from public, anon, authenticated;
grant  execute on function public.due_reminders() to service_role;
