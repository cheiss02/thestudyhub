-- =====================================================================
-- Update 003: families must be approved by a club admin before booking.
-- Run once: Supabase → SQL Editor → paste → Run.
-- =====================================================================

create table if not exists public.families (
  id          uuid primary key default auth.uid() references auth.users on delete cascade,
  parent_name text not null check (char_length(parent_name) between 2 and 60),
  city        text not null default '' check (char_length(city) <= 60),
  home_lang   text not null default '' check (char_length(home_lang) <= 60),
  heard       text not null default '' check (char_length(heard) <= 200),
  status      text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Families can't approve themselves.
create or replace function public.families_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.status := 'pending'; new.reviewed_at := null; end if;
  elsif new.status is distinct from old.status then
    if not public.is_admin() then new.status := old.status;
    else new.reviewed_at := now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists families_guard on public.families;
create trigger families_guard before insert or update on public.families
  for each row execute function public.families_guard();

alter table public.families enable row level security;
drop policy if exists fam_select on public.families;
drop policy if exists fam_insert on public.families;
drop policy if exists fam_update on public.families;
create policy fam_select on public.families for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy fam_insert on public.families for insert to authenticated
  with check (id = auth.uid());
create policy fam_update on public.families for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Tutors see the family's language info only through requests; nothing else changes.

-- Requests now also require an approved family account.
create or replace function public.requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if not exists (select 1 from public.families f where f.id = auth.uid() and f.status = 'approved') then
    raise exception 'Your family account is waiting for a club admin to approve it.';
  end if;
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

-- Deleting family data also removes the family profile.
create or replace function public.delete_my_family_data()
returns void language sql security definer set search_path = public as $$
  delete from public.requests where parent_id = auth.uid();
  delete from public.families where id = auth.uid();
$$;
