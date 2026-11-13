-- =====================================================================
-- The Study Hub — database setup
-- Run this ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: it drops and recreates its own policies and functions.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- Club admins (officers + advisor). Add emails at the bottom of this file.
create table if not exists public.admins (
  email text primary key
);

-- Public tutor profile (families can see active tutors).
create table if not exists public.tutors (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null check (char_length(name) between 2 and 40),
  grade      text not null,
  langs      text[] not null default '{}',
  subjects   text[] not null default '{}',
  bio        text not null default '' check (char_length(bio) <= 400),
  status     text not null default 'pending'
             check (status in ('pending','active','paused','declined')),
  created_at timestamptz not null default now()
);

-- Private tutor info (only the tutor and admins can see it).
create table if not exists public.tutor_private (
  tutor_id          uuid primary key references public.tutors(id) on delete cascade,
  school_email      text not null,
  meet_link         text not null default ''
                    check (meet_link = '' or meet_link ~ '^https://meet\.google\.com/'),
  why               text not null default '' check (char_length(why) <= 600),
  conduct_agreed_at timestamptz
);

-- Weekly open times. dow: 1 = Monday ... 5 = Friday. slot: 'HH:MM' 24-hour.
create table if not exists public.availability (
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  dow      smallint not null check (dow between 1 and 7),
  slot     text not null check (slot ~ '^\d{2}:\d{2}$'),
  primary key (tutor_id, dow, slot)
);

-- Session requests from parents.
create table if not exists public.requests (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references public.tutors(id) on delete cascade,
  parent_id    uuid not null default auth.uid() references auth.users on delete cascade,
  parent_name  text not null check (char_length(parent_name) between 2 and 60),
  session_date date not null,
  slot         text not null,
  child_first  text not null check (char_length(child_first) between 1 and 30),
  grade        text not null,
  lang         text not null,
  subject      text not null,
  note         text not null default '' check (char_length(note) <= 600),
  photo_paths  text[] not null default '{}' check (cardinality(photo_paths) <= 6),
  consent_at   timestamptz not null default now(),
  status       text not null default 'pending'
               check (status in ('pending','approved','declined','cancelled')),
  tutor_note   text not null default '',
  responded_at timestamptz,
  created_at   timestamptz not null default now()
);

-- A tutor can't be double-booked.
create unique index if not exists requests_no_double
  on public.requests (tutor_id, session_date, slot)
  where status in ('pending','approved');

create index if not exists requests_parent on public.requests (parent_id);
create index if not exists requests_tutor  on public.requests (tutor_id, session_date);

-- ---------------------------------------------------------------------
-- 2. HELPERS
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Today's date in California.
create or replace function public.club_today() returns date
language sql stable as $$
  select (now() at time zone 'America/Los_Angeles')::date;
$$;

-- ---------------------------------------------------------------------
-- 3. GUARDS (rules the database enforces no matter what the website does)
-- ---------------------------------------------------------------------

-- Tutors can't approve themselves. New tutors always start as 'pending'.
create or replace function public.tutors_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.status := 'pending'; end if;
  elsif new.status is distinct from old.status and not public.is_admin() then
    new.status := old.status;
  end if;
  return new;
end $$;

drop trigger if exists tutors_guard on public.tutors;
create trigger tutors_guard before insert or update on public.tutors
  for each row execute function public.tutors_guard();

-- New requests: must be signed in, have photos, be a real open time in the next 3 weeks.
create or replace function public.requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  new.parent_id    := auth.uid();
  new.status       := 'pending';
  new.tutor_note   := '';
  new.responded_at := null;
  new.consent_at   := now();

  if cardinality(new.photo_paths) < 1 then
    raise exception 'Please add at least one homework photo.';
  end if;
  if exists (select 1 from unnest(new.photo_paths) p
             where p not like auth.uid()::text || '/%') then
    raise exception 'Invalid photo.';
  end if;
  if new.session_date < public.club_today()
     or new.session_date > public.club_today() + 21 then
    raise exception 'Please pick a date in the next 3 weeks.';
  end if;
  if not exists (
    select 1 from public.tutors t
    join public.availability a on a.tutor_id = t.id
    where t.id = new.tutor_id and t.status = 'active'
      and a.dow = extract(isodow from new.session_date)
      and a.slot = new.slot
  ) then
    raise exception 'Sorry, that time is no longer open.';
  end if;
  return new;
end $$;

drop trigger if exists requests_guard on public.requests;
create trigger requests_guard before insert on public.requests
  for each row execute function public.requests_guard();

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (who can see / change what)
-- ---------------------------------------------------------------------

alter table public.admins        enable row level security;
alter table public.tutors        enable row level security;
alter table public.tutor_private enable row level security;
alter table public.availability  enable row level security;
alter table public.requests      enable row level security;

drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select using (public.is_admin());

-- tutors
drop policy if exists tutors_select on public.tutors;
drop policy if exists tutors_insert on public.tutors;
drop policy if exists tutors_update on public.tutors;
drop policy if exists tutors_delete on public.tutors;
create policy tutors_select on public.tutors for select
  using (status = 'active' or id = auth.uid() or public.is_admin());
create policy tutors_insert on public.tutors for insert to authenticated
  with check (id = auth.uid());
create policy tutors_update on public.tutors for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy tutors_delete on public.tutors for delete to authenticated
  using (public.is_admin());

-- tutor_private
drop policy if exists tp_select on public.tutor_private;
drop policy if exists tp_insert on public.tutor_private;
drop policy if exists tp_update on public.tutor_private;
create policy tp_select on public.tutor_private for select to authenticated
  using (tutor_id = auth.uid() or public.is_admin());
create policy tp_insert on public.tutor_private for insert to authenticated
  with check (tutor_id = auth.uid());
create policy tp_update on public.tutor_private for update to authenticated
  using (tutor_id = auth.uid() or public.is_admin())
  with check (tutor_id = auth.uid() or public.is_admin());

-- availability
drop policy if exists av_select on public.availability;
drop policy if exists av_insert on public.availability;
drop policy if exists av_delete on public.availability;
create policy av_select on public.availability for select
  using (tutor_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.tutors t where t.id = tutor_id and t.status = 'active'));
create policy av_insert on public.availability for insert to authenticated
  with check (tutor_id = auth.uid());
create policy av_delete on public.availability for delete to authenticated
  using (tutor_id = auth.uid() or public.is_admin());

-- requests: parents insert their own; status changes only through the functions below.
drop policy if exists rq_select on public.requests;
drop policy if exists rq_insert on public.requests;
create policy rq_select on public.requests for select to authenticated
  using (parent_id = auth.uid() or tutor_id = auth.uid() or public.is_admin());
create policy rq_insert on public.requests for insert to authenticated
  with check (parent_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. FUNCTIONS THE WEBSITE CALLS
-- ---------------------------------------------------------------------

-- Which times are taken (no child info is shared).
create or replace function public.booked_slots(from_date date, to_date date)
returns table (tutor_id uuid, session_date date, slot text)
language sql stable security definer set search_path = public as $$
  select r.tutor_id, r.session_date, r.slot
  from public.requests r
  where r.status in ('pending','approved')
    and r.session_date between from_date and to_date;
$$;

-- Tutor (or admin) approves or declines a request.
create or replace function public.respond_request(req uuid, approve boolean, note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = req for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.tutor_id <> auth.uid() and not public.is_admin() then raise exception 'Not allowed.'; end if;
  if r.status <> 'pending' then raise exception 'This request was already answered.'; end if;
  if approve and coalesce((select meet_link from public.tutor_private where tutor_id = r.tutor_id), '') = '' then
    raise exception 'Add your Google Meet link in your profile before approving.';
  end if;
  update public.requests
     set status = case when approve then 'approved' else 'declined' end,
         tutor_note = left(coalesce(respond_request.note, ''), 400),
         responded_at = now()
   where id = req;
end $$;

-- Parent, tutor or admin cancels.
create or replace function public.cancel_request(req uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.requests
     set status = 'cancelled', responded_at = now()
   where id = req
     and status in ('pending','approved')
     and (parent_id = auth.uid() or tutor_id = auth.uid() or public.is_admin());
  if not found then raise exception 'Not allowed.'; end if;
end $$;

-- A parent's own requests, with the Meet link only once approved.
create or replace function public.my_requests()
returns table (id uuid, tutor_name text, session_date date, slot text, child_first text,
               subject text, status text, tutor_note text, meet_link text, photo_paths text[])
language sql stable security definer set search_path = public as $$
  select r.id, t.name, r.session_date, r.slot, r.child_first, r.subject, r.status, r.tutor_note,
         case when r.status = 'approved' then p.meet_link end,
         r.photo_paths
  from public.requests r
  join public.tutors t on t.id = r.tutor_id
  left join public.tutor_private p on p.tutor_id = r.tutor_id
  where r.parent_id = auth.uid()
  order by r.session_date desc, r.slot;
$$;

-- Parent deletes all their requests (photos are deleted by the website first).
create or replace function public.delete_my_family_data()
returns void language sql security definer set search_path = public as $$
  delete from public.requests where parent_id = auth.uid();
$$;

revoke execute on function public.respond_request(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_request(uuid)                 from public, anon;
revoke execute on function public.my_requests()                        from public, anon;
revoke execute on function public.delete_my_family_data()              from public, anon;
grant  execute on function public.respond_request(uuid, boolean, text) to authenticated;
grant  execute on function public.cancel_request(uuid)                 to authenticated;
grant  execute on function public.my_requests()                        to authenticated;
grant  execute on function public.delete_my_family_data()              to authenticated;
grant  execute on function public.booked_slots(date, date)             to anon, authenticated;
grant  execute on function public.is_admin()                           to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. PRIVATE PHOTO STORAGE
-- Photos live at homework/<parent id>/<random>.jpg
-- Only the parent, the chosen tutor and admins can open them.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homework', 'homework', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists hw_upload on storage.objects;
drop policy if exists hw_read   on storage.objects;
drop policy if exists hw_delete on storage.objects;

create policy hw_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'homework'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy hw_read on storage.objects for select to authenticated
  using (bucket_id = 'homework' and (
           (storage.foldername(name))[1] = auth.uid()::text
           or public.is_admin()
           or exists (select 1 from public.requests r
                      where r.tutor_id = auth.uid() and name = any (r.photo_paths))));

create policy hw_delete on storage.objects for delete to authenticated
  using (bucket_id = 'homework' and (
           (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 7. ADMINS — put the real club emails here, then run this file.
-- ---------------------------------------------------------------------
insert into public.admins (email) values
  ('support@thestudyhub.us'),
  ('help@thestudyhub.us')
  -- ,('advisor@school.org')
  -- ,('officer@school.org')
on conflict do nothing;
