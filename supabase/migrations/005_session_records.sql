-- =====================================================================
-- Update 005: tutors mark sessions as done, session history, help-hour
-- counters for admins, and resets for starting fresh after testing.
-- Run once: Supabase → SQL Editor → paste → Run.
-- =====================================================================

-- 1) Session record fields
alter table public.requests
  add column if not exists completed_at timestamptz,
  add column if not exists attended     boolean,
  add column if not exists minutes      smallint check (minutes is null or minutes between 5 and 180),
  add column if not exists session_note text not null default '' check (char_length(session_note) <= 600);

create index if not exists requests_completed on public.requests (completed_at) where completed_at is not null;

-- Tutor (or admin) marks an approved session as done, after it has started.
create or replace function public.complete_session(req uuid, joined boolean, mins int default 30, note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = req for update;
  if not found then raise exception 'Session not found.'; end if;
  if r.tutor_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed.'; end if;
  if r.status <> 'approved' then raise exception 'Only approved sessions can be marked as done.'; end if;
  if r.completed_at is not null then raise exception 'This session was already logged.'; end if;
  if (r.session_date + r.slot::time) > (now() at time zone 'America/Los_Angeles') then
    raise exception 'You can log this session once it has started.';
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

-- minutes = 0 is allowed for "didn't join"
alter table public.requests drop constraint if exists requests_minutes_check;
alter table public.requests add constraint requests_minutes_check check (minutes is null or minutes between 0 and 180);

-- 2) Parents see their history (adds the new fields).
drop function if exists public.my_requests();
create function public.my_requests()
returns table (id uuid, tutor_name text, session_date date, slot text, child_first text,
               subject text, status text, tutor_note text, meet_link text, photo_paths text[],
               completed_at timestamptz, attended boolean, minutes smallint, session_note text)
language sql stable security definer set search_path = public as $$
  select r.id, t.name, r.session_date, r.slot, r.child_first, r.subject, r.status, r.tutor_note,
         case when r.status = 'approved' and r.completed_at is null then p.meet_link end,
         r.photo_paths, r.completed_at, r.attended, r.minutes, r.session_note
  from public.requests r
  join public.tutors t on t.id = r.tutor_id
  left join public.tutor_private p on p.tutor_id = r.tutor_id
  where r.parent_id = auth.uid()
  order by r.session_date desc, r.slot;
$$;
revoke execute on function public.my_requests() from public, anon;
grant  execute on function public.my_requests() to authenticated;

-- 3) Counters admins can reset ("start counting from today").
create table if not exists public.club_settings (
  key   text primary key,
  since timestamptz not null default '2000-01-01'
);
insert into public.club_settings (key) values ('hours'), ('sessions'), ('requests'), ('families')
on conflict do nothing;

alter table public.club_settings enable row level security;
drop policy if exists cs_select on public.club_settings;
create policy cs_select on public.club_settings for select to authenticated using (public.is_admin());

create or replace function public.reset_metric(metric text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed.'; end if;
  update public.club_settings set since = now() where key = metric;
  if not found then raise exception 'Unknown counter.'; end if;
end $$;
revoke execute on function public.reset_metric(text) from public, anon;
grant  execute on function public.reset_metric(text) to authenticated;

-- 4) Admins can clean up test data.
drop policy if exists rq_delete on public.requests;
create policy rq_delete on public.requests for delete to authenticated using (public.is_admin());
drop policy if exists fam_delete on public.families;
create policy fam_delete on public.families for delete to authenticated using (public.is_admin());
