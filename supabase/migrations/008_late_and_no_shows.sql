-- =====================================================================
-- Update 008: running late, last-minute cancels and no-shows.
--   • "Running late" button for parents and tutors (emails the other side)
--   • "Can't make it" works until the session ends; we record who cancelled
--   • Parents can report a tutor who didn't join (10+ minutes after start)
--   • No-show counts for admins
-- Run once: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- =====================================================================

alter table public.requests
  add column if not exists cancelled_by     text check (cancelled_by in ('parent','tutor','admin')),
  add column if not exists late_by          text check (late_by in ('parent','tutor')),
  add column if not exists late_minutes     smallint check (late_minutes is null or late_minutes between 5 and 30),
  add column if not exists late_at          timestamptz,
  add column if not exists tutor_no_show_at timestamptz;

-- Session start, as a Los Angeles wall-clock time.
create or replace function public.session_start(r public.requests) returns timestamp
language sql immutable as $$ select r.session_date + r.slot::time $$;

create or replace function public.la_now() returns timestamp
language sql stable as $$ select now() at time zone 'America/Los_Angeles' $$;

-- 1) Cancel ("Can't make it"): allowed until the session ends (start + 30 min).
create or replace function public.cancel_request(req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; who text;
begin
  select * into r from public.requests where id = req for update;
  if not found then raise exception 'Session not found.'; end if;
  who := case when r.parent_id = auth.uid() then 'parent'
              when r.tutor_id  = auth.uid() then 'tutor'
              when public.is_admin()        then 'admin' end;
  if who is null then raise exception 'Not allowed.'; end if;
  if r.status not in ('pending','approved') or r.completed_at is not null then
    raise exception 'This session can''t be cancelled anymore.';
  end if;
  if who <> 'admin' and public.la_now() > public.session_start(r) + interval '30 minutes' then
    raise exception 'This session has already ended.';
  end if;
  update public.requests
     set status = 'cancelled', cancelled_by = who, responded_at = now()
   where id = req;
end $$;

-- 2) Running late: from 1 hour before the start until the session ends.
create or replace function public.running_late(req uuid, mins int)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; who text;
begin
  select * into r from public.requests where id = req for update;
  if not found then raise exception 'Session not found.'; end if;
  who := case when r.parent_id = auth.uid() then 'parent'
              when r.tutor_id  = auth.uid() then 'tutor' end;
  if who is null then raise exception 'Not allowed.'; end if;
  if r.status <> 'approved' or r.completed_at is not null then
    raise exception 'Only approved sessions can get a late notice.';
  end if;
  if public.la_now() < public.session_start(r) - interval '1 hour'
     or public.la_now() > public.session_start(r) + interval '30 minutes' then
    raise exception 'You can send a late notice from 1 hour before the session until it ends.';
  end if;
  if mins is null or mins not in (5, 10, 15, 20, 30) then raise exception 'Pick how late you''ll be.'; end if;
  update public.requests
     set late_by = who, late_minutes = mins, late_at = now()
   where id = req;
end $$;

-- 3) Parent reports the tutor never joined: 10 minutes after the start, up to 2 days later.
create or replace function public.report_tutor_no_show(req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = req for update;
  if not found then raise exception 'Session not found.'; end if;
  if r.parent_id <> auth.uid() then raise exception 'Not allowed.'; end if;
  if r.status <> 'approved' or r.completed_at is not null then
    raise exception 'This session was already logged.';
  end if;
  if public.la_now() < public.session_start(r) + interval '10 minutes' then
    raise exception 'Please wait 10 minutes after the start time before reporting.';
  end if;
  if public.la_now() > public.session_start(r) + interval '2 days' then
    raise exception 'It''s been more than 2 days. Please email help@thestudyhub.us instead.';
  end if;
  update public.requests
     set tutor_no_show_at = now(), completed_at = now(), attended = false, minutes = 0,
         session_note = 'The family reported that the tutor did not join.'
   where id = req;
end $$;

revoke execute on function public.cancel_request(uuid)         from public, anon;
revoke execute on function public.running_late(uuid, int)      from public, anon;
revoke execute on function public.report_tutor_no_show(uuid)   from public, anon;
grant  execute on function public.cancel_request(uuid)         to authenticated;
grant  execute on function public.running_late(uuid, int)      to authenticated;
grant  execute on function public.report_tutor_no_show(uuid)   to authenticated;
revoke execute on function public.session_start(public.requests) from public, anon;
revoke execute on function public.la_now() from public, anon;

-- 4) Parents see late notices, who cancelled, and tutor no-shows.
drop function if exists public.my_requests();
create function public.my_requests()
returns table (id uuid, tutor_name text, session_date date, slot text, child_first text,
               subject text, status text, tutor_note text, meet_link text, photo_paths text[],
               completed_at timestamptz, attended boolean, minutes smallint, session_note text,
               cancelled_by text, late_by text, late_minutes smallint, tutor_no_show_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, t.name, r.session_date, r.slot, r.child_first, r.subject, r.status, r.tutor_note,
         case when r.status = 'approved' and r.completed_at is null then p.meet_link end,
         r.photo_paths, r.completed_at, r.attended, r.minutes, r.session_note,
         r.cancelled_by, r.late_by, r.late_minutes, r.tutor_no_show_at
  from public.requests r
  join public.tutors t on t.id = r.tutor_id
  left join public.tutor_private p on p.tutor_id = r.tutor_id
  where r.parent_id = auth.uid()
  order by r.session_date desc, r.slot;
$$;
revoke execute on function public.my_requests() from public, anon;
grant  execute on function public.my_requests() to authenticated;

-- 5) No-shows in the last 30 days (used by emails and the admin page).
--    Family no-show = tutor logged "didn't join". Tutor no-show = family reported it.
create or replace function public.no_show_counts()
returns table (kind text, person uuid, n bigint)
language sql stable security definer set search_path = public as $$
  select 'family', r.parent_id, count(*) from public.requests r
   where r.attended = false and r.tutor_no_show_at is null and r.completed_at > now() - interval '30 days'
   group by r.parent_id
  union all
  select 'tutor', r.tutor_id, count(*) from public.requests r
   where r.tutor_no_show_at > now() - interval '30 days'
   group by r.tutor_id;
$$;
revoke execute on function public.no_show_counts() from public, anon, authenticated;
grant  execute on function public.no_show_counts() to service_role;

create or replace function public.admin_no_show_counts()
returns table (kind text, person uuid, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed.'; end if;
  return query select * from public.no_show_counts();
end $$;
revoke execute on function public.admin_no_show_counts() from public, anon;
grant  execute on function public.admin_no_show_counts() to authenticated;

-- 6) Tutors log a no-show only after waiting 10 minutes.
--    (A session the family already reported is closed, so it can't be logged again.)
create or replace function public.complete_session(req uuid, joined boolean, mins int default 30, note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = req for update;
  if not found then raise exception 'Session not found.'; end if;
  if r.tutor_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed.'; end if;
  if r.status <> 'approved' then raise exception 'Only approved sessions can be marked as done.'; end if;
  if r.completed_at is not null then raise exception 'This session was already logged.'; end if;
  if public.session_start(r) > public.la_now() then
    raise exception 'You can log this session once it has started.';
  end if;
  if not joined and public.la_now() < public.session_start(r) + interval '10 minutes' then
    raise exception 'Please wait at least 10 minutes in the Meet before marking that the child didn''t join.';
  end if;
  update public.requests
     set completed_at = now(),
         attended     = joined,
         minutes      = case when joined then greatest(5, least(coalesce(mins, 30), 180)) else 0 end,
         session_note = left(coalesce(complete_session.note, ''), 600)
   where id = req;
end $$;
revoke execute on function public.complete_session(uuid, boolean, int, text) from public, anon;
grant  execute on function public.complete_session(uuid, boolean, int, text) to authenticated;
